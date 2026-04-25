import { ipcMain } from "electron"
import { eq } from "drizzle-orm"
import { getDb, invoices, invoiceLines, clients, profile } from "../../db/schema"
import { getDataRootPath } from "../../db/schema"
import { join } from "path"
import { existsSync, mkdirSync, readFileSync } from "fs"
import puppeteer from "puppeteer"
import { buildSlug } from "./utils"

function formatDate(dateStr: string, locale: string): string {
    const [year, month, day] = dateStr.split("-").map(Number)
    const date = new Date(year, month - 1, day)
    return locale === "fr-CA" ? date.toLocaleDateString("fr-CA") : date.toLocaleDateString("en-CA")
}

function formatCurrency(amount: number, locale: string): string {
    if (locale === "fr-CA") return `${amount.toFixed(2).replace(".", ",")} $`
    return `$${amount.toFixed(2)}`
}

type Line = {
    position: number
    label: string
    description: string | null
    qty: number
    unitPrice: number
    amount: number
}

function buildDescriptionBlock(invoice: {
    periodStart: string
    periodEnd: string
    description: string
    invoiceType: string | null
}, lines: Line[], locale: string): string {
    const isFreeform = (invoice.invoiceType ?? "weekly") === "freeform"
    const periodLabel = locale === "fr-CA" ? "Période" : "Period"
    const hoursLabel = locale === "fr-CA" ? "Heures travaillées" : "Hours worked"

    const totalHours = lines.reduce((sum, l) => sum + l.qty, 0)
    let period = `${formatDate(invoice.periodStart, locale)} → ${formatDate(invoice.periodEnd, locale)}`
    if (isFreeform) period += ` &nbsp;·&nbsp; ${hoursLabel} : ${totalHours} h`

    const servicesHtml = invoice.description
        ? `<div class="desc-block-services">${invoice.description.replace(/\n/g, " · ")}</div>`
        : ""

    return `
        <div class="desc-block">
            <div class="desc-block-period">${periodLabel} : ${period}</div>
            ${servicesHtml}
        </div>`
}

function buildLineItems(lines: Line[], locale: string): string {
    return lines.map((line) => `
        <tr>
            <td>
                <div class="desc-title">${line.label}</div>
                ${line.description ? `<div class="desc-date">${line.description}</div>` : ""}
            </td>
            <td class="right col-rate">${formatCurrency(line.unitPrice, locale)}</td>
            <td class="right col-qty">${line.qty}</td>
            <td class="right col-amt">${formatCurrency(line.amount, locale)}</td>
        </tr>`).join("")
}

function buildTotalsRows(invoice: {
    subtotal: number
    gstAmount: number
    qstAmount: number
    total: number
}, locale: string): string {
    const taxTotal = invoice.gstAmount + invoice.qstAmount
    return `
        <tr>
            <td class="t-label">Sous-total</td>
            <td class="t-value">${formatCurrency(invoice.subtotal, locale)}</td>
        </tr>
        <tr>
            <td class="t-label">Taxe</td>
            <td class="t-value">${formatCurrency(taxTotal, locale)}</td>
        </tr>
        <tr class="t-sep">
            <td class="t-label">Total</td>
            <td class="t-value">${formatCurrency(invoice.total, locale)}</td>
        </tr>
        <tr>
            <td class="t-label">Montant payé</td>
            <td class="t-value">${formatCurrency(0, locale)}</td>
        </tr>
        <tr class="t-sep t-due">
            <td class="t-label">Montant dû (CAD)</td>
            <td class="t-value">${formatCurrency(invoice.total, locale)}</td>
        </tr>`
}

export function registerPdfHandlers(): void {
    ipcMain.handle("pdf:generateInvoice", async (_event, invoiceId: number) => {
        try {
            const db = getDb()
            const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1).all()[0]
            if (!invoice) return { success: false, error: "Invoice not found" }
            if (invoice.status === "paid") return { success: false, error: "paid" }

            const client = db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1).all()[0]
            const prof = db.select().from(profile).limit(1).all()[0]
            if (!client || !prof) return { success: false, error: "Missing client or profile" }

            const lines = db
                .select()
                .from(invoiceLines)
                .where(eq(invoiceLines.invoiceId, invoiceId))
                .orderBy(invoiceLines.position)
                .all()

            const locale = prof.locale ?? "fr-CA"
            const templatePath = join(__dirname, "../../templates/invoice-default.html")
            let html = readFileSync(templatePath, "utf-8")

            const logoBlock = prof.logoPath ? `<img src="file://${prof.logoPath}" alt="Logo" />` : ""

            const issuerLines: string[] = [prof.name]
            for (const line of (prof.address ?? "").split("\n")) {
                if (line.trim()) issuerLines.push(line.trim())
            }
            const cityLine = [prof.city, prof.province, prof.postalCode].filter(Boolean).join(" ")
            if (cityLine) issuerLines.push(cityLine)
            if (prof.country) issuerLines.push(prof.country)
            if (prof.phone) issuerLines.push(prof.phone)
            if (prof.email) issuerLines.push(prof.email)
            if (prof.gstNumber) issuerLines.push(`TPS : ${prof.gstNumber}`)
            if (prof.qstNumber) issuerLines.push(`TVQ : ${prof.qstNumber}`)
            const issuerBlock = issuerLines.filter(Boolean).join("<br>")

            const dueDateLabel = locale === "fr-CA" ? "Date d'échéance" : "Due date"
            const dueDateBlock = invoice.dueDate
                ? `<div class="meta-label" style="margin-top:6px">${dueDateLabel}</div><div class="meta-value" style="font-size:10pt;color:#c0392b">${formatDate(invoice.dueDate, locale)}</div>`
                : ""

            const replacements: Record<string, string> = {
                "{{logoBlock}}": logoBlock,
                "{{issuerBlock}}": issuerBlock,
                "{{clientName}}": client.companyName ?? client.name,
                "{{clientAddress}}": (client.address ?? "").replace(/\n/g, "<br>"),
                "{{date}}": formatDate(invoice.issueDate, locale),
                "{{dueDateBlock}}": dueDateBlock,
                "{{number}}": invoice.number,
                "{{total}}": formatCurrency(invoice.total, locale),
                "{{descriptionBlock}}": buildDescriptionBlock(invoice, lines, locale),
                "{{lineItems}}": buildLineItems(lines, locale),
                "{{totalsRows}}": buildTotalsRows(invoice, locale),
            }

            for (const [key, value] of Object.entries(replacements)) {
                html = html.replaceAll(key, value)
            }

            const year = invoice.issueDate.substring(0, 4)
            const userSlug = buildSlug(prof.name)
            const clientSlug = buildSlug(client.companyName ?? client.name)
            const outputDir = join(getDataRootPath(), "attachments", "invoices", year)
            if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })
            const pdfPath = join(outputDir, `invoice_${userSlug}_${invoice.number}_${clientSlug}_${invoice.issueDate}.pdf`)

            const browser = await puppeteer.launch({ headless: true })
            const page = await browser.newPage()
            await page.setContent(html, { waitUntil: "networkidle0" })
            await page.pdf({ path: pdfPath, format: "A4", printBackground: true })
            await browser.close()

            db.update(invoices)
                .set({ pdfPath, updatedAt: new Date().toISOString() })
                .where(eq(invoices.id, invoiceId))
                .run()

            return { success: true, data: pdfPath }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })
}
