import { ipcMain } from "electron"
import { eq } from "drizzle-orm"
import { getDb, getRawDb, payments, invoices, clients, profile, getDataRootPath } from "../../db/schema"
import { copyFileSync, mkdirSync, existsSync } from "fs"
import { join, basename } from "path"
import { buildSlug, resolveDestPath } from "./utils"
import { appendLedgerEntry } from "./ledger"
import puppeteer from "puppeteer"

function getNextReceiptNumber(year: number): string {
    const rawDb = getRawDb()
    const row = rawDb.prepare("SELECT COUNT(*) as cnt FROM payments WHERE receipt_number LIKE ?").get(`RCP-${year}-%`) as { cnt: number }
    return `RCP-${year}-${String((row?.cnt ?? 0) + 1).padStart(3, "0")}`
}

function fmtDate(s: string, locale: string): string {
    const [y, m, d] = s.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(locale)
}

function buildReceiptHtml(data: {
    receiptNumber: string
    paymentDate: string
    locale: string
    issuerName: string
    issuerAddress: string
    clientName: string
    clientAddress: string
    invoiceNumber: string
    amount: number
    paymentMethod: string
    reference: string | null
}): string {
    const { receiptNumber, paymentDate, locale, issuerName, issuerAddress, clientName, clientAddress, invoiceNumber, amount, paymentMethod, reference } = data
    const isFr = locale === "fr-CA"
    const fmtAmt = (n: number) => isFr ? `${n.toFixed(2).replace(".", ",")} $` : `$${n.toFixed(2)}`
    const methodLabels: Record<string, string> = isFr
        ? { wire: "Virement bancaire", cheque: "Chèque", interac: "Virement Interac", other: "Autre" }
        : { wire: "Wire transfer", cheque: "Cheque", interac: "Interac transfer", other: "Other" }

    return `<!DOCTYPE html>
<html lang="${isFr ? "fr" : "en"}">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  h1 { font-size: 22px; font-weight: 700; color: #16a34a; }
  .ref { font-size: 11px; color: #666; margin-top: 4px; }
  .meta { font-size: 11px; color: #333; text-align: right; }
  .parties { display: flex; gap: 40px; margin-bottom: 32px; }
  .party { flex: 1; }
  .party-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #888; margin-bottom: 6px; letter-spacing: 0.5px; }
  .party-name { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
  .party-addr { font-size: 10px; color: #555; white-space: pre-line; }
  .receipt-box { border: 2px solid #16a34a; border-radius: 8px; padding: 20px; background: #f0fdf4; margin-bottom: 24px; }
  .receipt-label { font-size: 10px; font-weight: 600; color: #16a34a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .receipt-amount { font-size: 28px; font-weight: 700; color: #16a34a; }
  .receipt-method { font-size: 11px; color: #555; margin-top: 8px; }
  .ref-invoice { margin-top: 24px; font-size: 11px; color: #333; border-top: 1px solid #e0e0e0; padding-top: 12px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${isFr ? "REÇU DE PAIEMENT" : "PAYMENT RECEIPT"}</h1>
      <div class="ref">${receiptNumber}</div>
    </div>
    <div class="meta">
      <div><strong>${isFr ? "Date" : "Date"}:</strong> ${fmtDate(paymentDate, locale)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">${isFr ? "Émetteur" : "Issuer"}</div>
      <div class="party-name">${issuerName}</div>
      <div class="party-addr">${issuerAddress.replace(/\n/g, "<br>")}</div>
    </div>
    <div class="party">
      <div class="party-label">${isFr ? "Payeur" : "Payer"}</div>
      <div class="party-name">${clientName}</div>
      <div class="party-addr">${clientAddress.replace(/\n/g, "<br>")}</div>
    </div>
  </div>

  <div class="receipt-box">
    <div class="receipt-label">${isFr ? "Paiement reçu" : "Payment received"}</div>
    <div class="receipt-amount">${fmtAmt(amount)}</div>
    <div class="receipt-method">${methodLabels[paymentMethod] ?? paymentMethod}${reference ? ` · ${reference}` : ""}</div>
  </div>

  <div class="ref-invoice">
    ${isFr ? "En règlement de la facture" : "In settlement of invoice"}: <strong>${invoiceNumber}</strong>
  </div>
</body>
</html>`
}

export function registerPaymentHandlers(): void {
    ipcMain.handle("payments:getForInvoice", (_event, invoiceId: number) => {
        try {
            const db = getDb()
            const result = db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).all()
            return { success: true, data: result }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Cash-basis revenue: all payments received in a given year, with invoice context.
    // Excludes payments on voided invoices.
    ipcMain.handle("payments:getByYear", (_event, year: number) => {
        try {
            const rawDb = getRawDb()
            const rows = rawDb.prepare(`
                SELECT
                    p.id, p.invoice_id, p.payment_date, p.amount, p.payment_method,
                    i.number AS invoice_number, i.total AS invoice_total,
                    i.client_id, i.issue_date
                FROM payments p
                JOIN invoices i ON p.invoice_id = i.id
                WHERE strftime('%Y', p.payment_date) = ?
                  AND i.status != 'voided'
                ORDER BY p.payment_date ASC
            `).all(String(year)) as {
                id: number; invoice_id: number; payment_date: string; amount: number
                payment_method: string; invoice_number: string; invoice_total: number
                client_id: number; issue_date: string
            }[]
            const data = rows.map((r) => ({
                id: r.id,
                invoiceId: r.invoice_id,
                invoiceNumber: r.invoice_number,
                invoiceTotal: r.invoice_total,
                clientId: r.client_id,
                issueDate: r.issue_date,
                paymentDate: r.payment_date,
                amount: r.amount,
                paymentMethod: r.payment_method,
            }))
            return { success: true, data }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("payments:create", async (_event, data: {
        invoiceId: number
        paymentDate: string
        amount: number
        paymentMethod: string
        reference?: string | null
        notes?: string | null
    }) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()
            const result = db
                .insert(payments)
                .values({
                    invoiceId: data.invoiceId,
                    paymentDate: data.paymentDate,
                    amount: data.amount,
                    paymentMethod: data.paymentMethod,
                    reference: data.reference ?? null,
                    notes: data.notes ?? null,
                    createdAt: now,
                })
                .returning()
                .all()
            const paymentId = result[0].id

            const invoice = db.select().from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1).all()[0]
            const client = invoice ? db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1).all()[0] : null
            const prof = db.select().from(profile).limit(1).all()[0]

            // Append payment to financial ledger
            try {
                if (invoice) {
                    appendLedgerEntry({
                        eventType: "payment_received",
                        invoiceId: data.invoiceId,
                        invoiceNumber: invoice.number,
                        clientName: client?.companyName ?? client?.name ?? "Client inconnu",
                        amount: data.amount,
                        year: parseInt(invoice.issueDate.substring(0, 4), 10),
                    })
                }
            } catch {
                // Non-fatal
            }

            // Auto-generate payment receipt PDF
            try {
                if (invoice && client && prof) {
                    const year = parseInt(data.paymentDate.substring(0, 4), 10)
                    const receiptNumber = getNextReceiptNumber(year)
                    const locale = prof.locale ?? "fr-CA"

                    const html = buildReceiptHtml({
                        receiptNumber,
                        paymentDate: data.paymentDate,
                        locale,
                        issuerName: prof.name,
                        issuerAddress: prof.address ?? "",
                        clientName: client.companyName ?? client.name,
                        clientAddress: client.address ?? "",
                        invoiceNumber: invoice.number,
                        amount: data.amount,
                        paymentMethod: data.paymentMethod,
                        reference: data.reference ?? null,
                    })

                    const userSlug = buildSlug(prof.name)
                    const clientSlug = buildSlug(client.companyName ?? client.name)
                    const rcpSlug = receiptNumber.toLowerCase().replace(/[^a-z0-9]/g, "-")
                    const destDir = join(getDataRootPath(), "attachments", "invoices", String(year))
                    mkdirSync(destDir, { recursive: true })
                    const destPath = resolveDestPath(destDir, `receipt_${userSlug}_${rcpSlug}_${clientSlug}_${data.paymentDate}.pdf`)

                    const browser = await puppeteer.launch({ headless: true })
                    const page = await browser.newPage()
                    await page.setContent(html, { waitUntil: "networkidle0" })
                    await page.pdf({ path: destPath, format: "A4", printBackground: true, margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" } })
                    await browser.close()

                    db.update(payments)
                        .set({ receiptNumber, receiptPath: destPath })
                        .where(eq(payments.id, paymentId))
                        .run()

                    const updated = db.select().from(payments).where(eq(payments.id, paymentId)).limit(1).all()[0]
                    return { success: true, data: updated }
                }
            } catch {
                // Non-fatal — payment already recorded, receipt generation failed silently
            }

            return { success: true, data: result[0] }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("payments:update", (_event, id: number, data: {
        paymentDate: string
        amount: number
        paymentMethod: string
        reference?: string | null
        notes?: string | null
    }) => {
        try {
            const db = getDb()
            db.update(payments)
                .set({
                    paymentDate: data.paymentDate,
                    amount: data.amount,
                    paymentMethod: data.paymentMethod,
                    reference: data.reference ?? null,
                    notes: data.notes ?? null,
                })
                .where(eq(payments.id, id))
                .run()
            const updatedPayment = db.select().from(payments).where(eq(payments.id, id)).limit(1).all()[0]
            return { success: true, data: updatedPayment }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("payments:delete", (_event, id: number) => {
        try {
            const db = getDb()
            db.delete(payments).where(eq(payments.id, id)).run()
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("payments:addProof", (_event, data: { paymentId: number; invoiceId: number; sourcePath: string }) => {
        try {
            const db = getDb()
            const invoice = db.select().from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1).all()[0]
            const client = invoice ? db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1).all()[0] : null
            const prof = db.select().from(profile).limit(1).all()[0]

            const year = invoice?.issueDate.substring(0, 4) ?? new Date().getFullYear().toString()
            const userSlug = buildSlug(prof?.name ?? "user")
            const clientSlug = buildSlug(client?.companyName ?? client?.name ?? "client")
            const invoiceNumber = invoice?.number ?? String(data.invoiceId)
            const originalName = basename(data.sourcePath)
            const newName = `payment-proof_${userSlug}_${invoiceNumber}_${clientSlug}_${originalName}`

            const destDir = join(getDataRootPath(), "attachments", "invoices", year)
            if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
            const destPath = resolveDestPath(destDir, newName)
            copyFileSync(data.sourcePath, destPath)

            db.update(payments)
                .set({ proofPath: destPath })
                .where(eq(payments.id, data.paymentId))
                .run()
            const updated = db.select().from(payments).where(eq(payments.id, data.paymentId)).limit(1).all()[0]
            return { success: true, data: updated }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })
}
