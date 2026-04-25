import { ipcMain, dialog } from "electron"
import { getDb, invoices, clients, expenses, profile } from "../../db/schema"
import { writeFileSync } from "fs"
import puppeteer from "puppeteer"

const EXPENSE_CATEGORIES = [
    "office_supplies", "telecom", "transport", "training", "equipment",
    "business_meals", "home_office", "software", "hosting", "domains",
    "api_credits", "other",
]

const CATEGORY_LABELS_FR: Record<string, string> = {
    office_supplies: "Fournitures de bureau",
    telecom: "Télécommunications",
    transport: "Transport",
    training: "Formation",
    equipment: "Équipement",
    business_meals: "Repas d'affaires",
    home_office: "Bureau à domicile",
    software: "Logiciels",
    hosting: "Hébergement",
    domains: "Domaines",
    api_credits: "Crédits API",
    other: "Autre",
}

function fmt(n: number, locale: string): string {
    return locale === "fr-CA"
        ? `${n.toFixed(2).replace(".", ",")} $`
        : `$${n.toFixed(2)}`
}

function fmtDate(s: string, locale: string): string {
    const [y, m, d] = s.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(locale)
}

export function registerReportHandlers(): void {
    ipcMain.handle("reports:exportCsv", async (_event, year: number) => {
        try {
            const dest = dialog.showSaveDialogSync({
                title: `Rapport fiscal ${year}`,
                defaultPath: `rapport-fiscal-${year}.csv`,
                filters: [{ name: "CSV", extensions: ["csv"] }],
            })
            if (!dest) return { success: false, error: "cancelled" }

            const db = getDb()
            const allInvoices = db.select().from(invoices).all()
                .filter((inv) => inv.issueDate.startsWith(String(year)) && inv.status === "paid")
            const allClients = db.select().from(clients).all()
            const allExpenses = db.select().from(expenses).all().filter((e) => e.year === year)
            const clientMap = new Map(allClients.map((c) => [c.id, c]))

            const rows: string[] = []
            // UTF-8 BOM for Excel compatibility
            rows.push("﻿RAPPORT FISCAL ANNUEL — " + year)
            rows.push("")

            rows.push("REVENUS (factures payées)")
            rows.push("Numéro,Client,Date,Montant ($)")
            let totalRevenue = 0
            for (const inv of allInvoices) {
                const client = clientMap.get(inv.clientId)
                const name = (client?.companyName ?? client?.name ?? "—").replace(/"/g, '""')
                rows.push(`${inv.number},"${name}",${inv.issueDate},${inv.total.toFixed(2)}`)
                totalRevenue += inv.total
            }
            rows.push(`TOTAL REVENUS,,,${totalRevenue.toFixed(2)}`)
            rows.push("")

            rows.push("DÉPENSES")
            rows.push("Date,Description,Catégorie,Montant ($),Taux déductible (%),Déductible ($),TPS payée ($),TVQ payée ($)")
            let totalExpenses = 0
            let totalDeductible = 0
            let totalGst = 0
            let totalQst = 0
            for (const exp of allExpenses) {
                const deductible = exp.amount * exp.deductibleRate
                const desc = exp.description.replace(/"/g, '""')
                rows.push(
                    `${exp.date},"${desc}","${exp.category}",${exp.amount.toFixed(2)},` +
                    `${(exp.deductibleRate * 100).toFixed(0)},${deductible.toFixed(2)},` +
                    `${exp.gstPaid.toFixed(2)},${exp.qstPaid.toFixed(2)}`
                )
                totalExpenses += exp.amount
                totalDeductible += deductible
                totalGst += exp.gstPaid
                totalQst += exp.qstPaid
            }
            rows.push(`TOTAL DÉPENSES,,,${totalExpenses.toFixed(2)},,${totalDeductible.toFixed(2)},${totalGst.toFixed(2)},${totalQst.toFixed(2)}`)
            rows.push("")

            const taxableIncome = Math.max(0, totalRevenue - totalDeductible)
            rows.push("RÉSUMÉ")
            rows.push(`Revenus bruts,${totalRevenue.toFixed(2)}`)
            rows.push(`Dépenses déductibles,${totalDeductible.toFixed(2)}`)
            rows.push(`Revenu net imposable,${taxableIncome.toFixed(2)}`)
            rows.push(`TPS payée sur dépenses,${totalGst.toFixed(2)}`)
            rows.push(`TVQ payée sur dépenses,${totalQst.toFixed(2)}`)

            writeFileSync(dest, rows.join("\r\n"), "utf-8")
            return { success: true, data: dest }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("reports:exportPdf", async (_event, year: number) => {
        try {
            const dest = dialog.showSaveDialogSync({
                title: `Rapport fiscal ${year}`,
                defaultPath: `rapport-fiscal-${year}.pdf`,
                filters: [{ name: "PDF", extensions: ["pdf"] }],
            })
            if (!dest) return { success: false, error: "cancelled" }

            const db = getDb()
            const prof = db.select().from(profile).limit(1).all()[0]
            const locale = prof?.locale ?? "fr-CA"
            const allInvoices = db.select().from(invoices).all()
                .filter((inv) => inv.issueDate.startsWith(String(year)) && inv.status === "paid")
            const allClients = db.select().from(clients).all()
            const allExpenses = db.select().from(expenses).all().filter((e) => e.year === year)
            const clientMap = new Map(allClients.map((c) => [c.id, c]))

            let totalRevenue = 0
            let totalDeductible = 0
            let totalGst = 0
            let totalQst = 0

            const invoiceRows = allInvoices.map((inv) => {
                const client = clientMap.get(inv.clientId)
                const name = client?.companyName ?? client?.name ?? "—"
                totalRevenue += inv.total
                return `<tr><td>${inv.number}</td><td>${name}</td><td>${fmtDate(inv.issueDate, locale)}</td><td class="right">${fmt(inv.total, locale)}</td></tr>`
            }).join("")

            // Expenses grouped by category
            const byCategory: Record<string, { amount: number; deductible: number }> = {}
            for (const exp of allExpenses) {
                if (!byCategory[exp.category]) byCategory[exp.category] = { amount: 0, deductible: 0 }
                byCategory[exp.category].amount += exp.amount
                byCategory[exp.category].deductible += exp.amount * exp.deductibleRate
                totalDeductible += exp.amount * exp.deductibleRate
                totalGst += exp.gstPaid
                totalQst += exp.qstPaid
            }

            const expenseRows = EXPENSE_CATEGORIES
                .filter((cat) => byCategory[cat])
                .map((cat) => {
                    const row = byCategory[cat]
                    const label = CATEGORY_LABELS_FR[cat] ?? cat
                    return `<tr><td>${label}</td><td class="right">${fmt(row.amount, locale)}</td><td class="right">${fmt(row.deductible, locale)}</td></tr>`
                }).join("")

            const taxableIncome = Math.max(0, totalRevenue - totalDeductible)
            const issuerName = prof?.name ?? ""

            const html = buildReportHtml({
                year, locale, issuerName,
                invoiceRows, expenseRows,
                totalRevenue, totalDeductible, taxableIncome, totalGst, totalQst,
            })

            const browser = await puppeteer.launch({ headless: true })
            const page = await browser.newPage()
            await page.setContent(html, { waitUntil: "networkidle0" })
            await page.pdf({ path: dest, format: "A4", printBackground: true, margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" } })
            await browser.close()

            return { success: true, data: dest }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })
}

function buildReportHtml(data: {
    year: number
    locale: string
    issuerName: string
    invoiceRows: string
    expenseRows: string
    totalRevenue: number
    totalDeductible: number
    taxableIncome: number
    totalGst: number
    totalQst: number
}): string {
    const { year, locale, issuerName, invoiceRows, expenseRows, totalRevenue, totalDeductible, taxableIncome, totalGst, totalQst } = data
    const isFr = locale === "fr-CA"

    return `<!DOCTYPE html>
<html lang="${isFr ? "fr" : "en"}">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  h1 { font-size: 20px; font-weight: 700; color: #5a8fa5; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: #666; margin-bottom: 32px; }
  h2 { font-size: 13px; font-weight: 600; color: #333; border-bottom: 2px solid #5a8fa5; padding-bottom: 4px; margin: 24px 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; font-weight: 600; color: #666; padding: 6px 8px; border-bottom: 1px solid #ddd; }
  td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
  .right { text-align: right; }
  .total-row td { font-weight: 700; border-top: 2px solid #ddd; border-bottom: none; padding-top: 8px; }
  .summary { margin-top: 24px; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; }
  .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; }
  .summary-row.sep { border-top: 1px solid #ddd; margin-top: 8px; padding-top: 12px; }
  .summary-row.highlight { font-size: 14px; font-weight: 700; color: #5a8fa5; margin-top: 8px; padding-top: 12px; border-top: 2px solid #5a8fa5; }
  .muted { color: #888; }
</style>
</head>
<body>
  <h1>${isFr ? "Rapport fiscal annuel" : "Annual Tax Report"} — ${year}</h1>
  <p class="subtitle">${issuerName}</p>

  <h2>${isFr ? "Revenus (factures payées)" : "Revenue (paid invoices)"}</h2>
  <table>
    <thead><tr>
      <th>${isFr ? "Numéro" : "Number"}</th>
      <th>${isFr ? "Client" : "Client"}</th>
      <th>${isFr ? "Date" : "Date"}</th>
      <th class="right">${isFr ? "Montant" : "Amount"}</th>
    </tr></thead>
    <tbody>${invoiceRows}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="3">${isFr ? "Total revenus bruts" : "Total gross revenue"}</td>
      <td class="right">${fmt(totalRevenue, locale)}</td>
    </tr></tfoot>
  </table>

  <h2>${isFr ? "Dépenses par catégorie" : "Expenses by category"}</h2>
  <table>
    <thead><tr>
      <th>${isFr ? "Catégorie" : "Category"}</th>
      <th class="right">${isFr ? "Montant total" : "Total amount"}</th>
      <th class="right">${isFr ? "Montant déductible" : "Deductible amount"}</th>
    </tr></thead>
    <tbody>${expenseRows}</tbody>
    <tfoot><tr class="total-row">
      <td>${isFr ? "Total dépenses déductibles" : "Total deductible expenses"}</td>
      <td></td>
      <td class="right">${fmt(totalDeductible, locale)}</td>
    </tr></tfoot>
  </table>

  <div class="summary">
    <div class="summary-row"><span>${isFr ? "Revenus bruts" : "Gross revenue"}</span><span>${fmt(totalRevenue, locale)}</span></div>
    <div class="summary-row muted"><span>${isFr ? "Dépenses déductibles" : "Deductible expenses"}</span><span>− ${fmt(totalDeductible, locale)}</span></div>
    <div class="summary-row sep"><span style="font-weight:600">${isFr ? "Revenu net imposable" : "Net taxable income"}</span><span style="font-weight:600">${fmt(taxableIncome, locale)}</span></div>
    ${totalGst > 0 || totalQst > 0 ? `
    <div class="summary-row muted" style="margin-top:12px"><span>${isFr ? "TPS payée sur dépenses" : "GST paid on expenses"}</span><span>${fmt(totalGst, locale)}</span></div>
    <div class="summary-row muted"><span>${isFr ? "TVQ payée sur dépenses" : "QST paid on expenses"}</span><span>${fmt(totalQst, locale)}</span></div>
    ` : ""}
  </div>
</body>
</html>`
}
