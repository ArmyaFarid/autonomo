import { ipcMain } from "electron"
import { eq, desc } from "drizzle-orm"
import {
    getDb, getRawDb,
    invoices, invoiceLines, invoiceAttachments, invoiceSequences, creditNotes, clients, profile, payments,
} from "../../db/schema"
import { copyFileSync, mkdirSync, existsSync, unlinkSync, writeFileSync } from "fs"
import { join, basename, extname } from "path"
import { getDataRootPath } from "../../db/schema"
import { buildSlug, resolveDestPath } from "./utils"
import { generateInvoicePdf } from "./pdf"
import { appendLedgerEntry } from "./ledger"
import puppeteer from "puppeteer"

type LineInput = {
    position: number
    label: string
    description?: string | null
    qty: number
    unitPrice: number
    amount: number
}

type InvoiceInput = {
    number: string
    clientId: number
    issueDate: string
    periodStart: string
    periodEnd: string
    invoiceType: "weekly" | "freeform" | "imported"
    description: string
    subtotal: number
    gstRate: number
    qstRate: number
    gstAmount: number
    qstAmount: number
    total: number
    dueDate?: string | null
    status: string
    notes?: string | null
}

// Phase 0 — transactional sequence generator.
// Atomically increments the year's counter and returns the hardcoded number string.
function generateNextInvoiceNumber(year: number, prefix: string, startNumber: number): string {
    const rawDb = getRawDb()
    let resultNumber = ""

    rawDb.transaction(() => {
        const row = rawDb.prepare(
            "SELECT last_sequence_number FROM invoice_sequences WHERE year = ?"
        ).get(year) as { last_sequence_number: number } | undefined

        const next = row ? row.last_sequence_number + 1 : startNumber

        if (row) {
            rawDb.prepare(
                "UPDATE invoice_sequences SET last_sequence_number = ? WHERE year = ?"
            ).run(next, year)
        } else {
            rawDb.prepare(
                "INSERT INTO invoice_sequences (year, last_sequence_number) VALUES (?, ?)"
            ).run(year, next)
        }

        resultNumber = `${prefix}${year}-${String(next).padStart(4, "0")}`
    })()

    return resultNumber
}

function getLines(invoiceId: number) {
    const db = getDb()
    return db
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, invoiceId))
        .orderBy(invoiceLines.position)
        .all()
}

// Returns a map of invoiceId → total paid, for a given list of invoice ids.
function buildTotalPaidMap(invoiceIds: number[]): Map<number, number> {
    if (invoiceIds.length === 0) return new Map()
    const rawDb = getRawDb()
    const placeholders = invoiceIds.map(() => "?").join(",")
    const rows = rawDb.prepare(
        `SELECT invoice_id, SUM(amount) as total_paid FROM payments WHERE invoice_id IN (${placeholders}) GROUP BY invoice_id`
    ).all(...invoiceIds) as { invoice_id: number; total_paid: number }[]
    return new Map(rows.map((r) => [r.invoice_id, r.total_paid]))
}

// Returns a map of invoiceId → total credited, for a given list of invoice ids.
function buildTotalCreditMap(invoiceIds: number[]): Map<number, number> {
    if (invoiceIds.length === 0) return new Map()
    const rawDb = getRawDb()
    const placeholders = invoiceIds.map(() => "?").join(",")
    const rows = rawDb.prepare(
        `SELECT invoice_id, SUM(amount) as total_credit FROM credit_notes WHERE invoice_id IN (${placeholders}) GROUP BY invoice_id`
    ).all(...invoiceIds) as { invoice_id: number; total_credit: number }[]
    return new Map(rows.map((r) => [r.invoice_id, r.total_credit]))
}

function getClientName(clientId: number): string {
    const db = getDb()
    const client = db.select().from(clients).where(eq(clients.id, clientId)).limit(1).all()[0]
    return client?.companyName ?? client?.name ?? "Client inconnu"
}

function getNextCreditNoteNumber(year: number): string {
    const rawDb = getRawDb()
    const row = rawDb.prepare("SELECT COUNT(*) as cnt FROM credit_notes WHERE number LIKE ?").get(`NC-${year}-%`) as { cnt: number }
    return `NC-${year}-${String((row?.cnt ?? 0) + 1).padStart(3, "0")}`
}

function fmtDate(s: string, locale: string): string {
    const [y, m, d] = s.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(locale)
}

function buildCreditNoteHtml(data: {
    cnNumber: string
    cnDate: string
    locale: string
    issuerName: string
    issuerAddress: string
    clientName: string
    clientAddress: string
    invoiceNumber: string
    amount: number
    reason: string
}): string {
    const { cnNumber, cnDate, locale, issuerName, issuerAddress, clientName, clientAddress, invoiceNumber, amount, reason } = data
    const isFr = locale === "fr-CA"
    const fmtAmt = (n: number) => isFr ? `${n.toFixed(2).replace(".", ",")} $` : `$${n.toFixed(2)}`

    return `<!DOCTYPE html>
<html lang="${isFr ? "fr" : "en"}">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  h1 { font-size: 22px; font-weight: 700; color: #7c3aed; }
  .ref { font-size: 11px; color: #666; margin-top: 4px; }
  .meta { font-size: 11px; color: #333; text-align: right; }
  .parties { display: flex; gap: 40px; margin-bottom: 32px; }
  .party { flex: 1; }
  .party-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #888; margin-bottom: 6px; letter-spacing: 0.5px; }
  .party-name { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
  .party-addr { font-size: 10px; color: #555; white-space: pre-line; }
  .credit-box { border: 2px solid #7c3aed; border-radius: 8px; padding: 20px; background: #faf5ff; margin-bottom: 24px; }
  .credit-label { font-size: 10px; font-weight: 600; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .credit-amount { font-size: 28px; font-weight: 700; color: #7c3aed; }
  .credit-reason { font-size: 11px; color: #555; margin-top: 8px; }
  .ref-invoice { margin-top: 24px; font-size: 11px; color: #333; border-top: 1px solid #e0e0e0; padding-top: 12px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${isFr ? "NOTE DE CRÉDIT" : "CREDIT NOTE"}</h1>
      <div class="ref">${cnNumber}</div>
    </div>
    <div class="meta">
      <div><strong>${isFr ? "Date" : "Date"}:</strong> ${fmtDate(cnDate, locale)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">${isFr ? "Émetteur" : "Issuer"}</div>
      <div class="party-name">${issuerName}</div>
      <div class="party-addr">${issuerAddress.replace(/\n/g, "<br>")}</div>
    </div>
    <div class="party">
      <div class="party-label">${isFr ? "Client" : "Client"}</div>
      <div class="party-name">${clientName}</div>
      <div class="party-addr">${clientAddress.replace(/\n/g, "<br>")}</div>
    </div>
  </div>

  <div class="credit-box">
    <div class="credit-label">${isFr ? "Montant crédité" : "Credited amount"}</div>
    <div class="credit-amount">${fmtAmt(amount)}</div>
    <div class="credit-reason">${reason}</div>
  </div>

  <div class="ref-invoice">
    ${isFr ? "En référence à la facture" : "With reference to invoice"}: <strong>${invoiceNumber}</strong>
  </div>
</body>
</html>`
}

export function registerInvoiceHandlers(): void {
    ipcMain.handle("invoices:getAll", (_event, filters?: { clientId?: number; status?: string; year?: number }) => {
        try {
            const db = getDb()
            let result = db.select().from(invoices).orderBy(desc(invoices.createdAt)).all()
            if (filters?.clientId) result = result.filter((i) => i.clientId === filters.clientId)
            if (filters?.year) result = result.filter((i) => i.issueDate.startsWith(String(filters.year)))

            const ids = result.map((i) => i.id)
            const totalPaidMap = buildTotalPaidMap(ids)
            const totalCreditMap = buildTotalCreditMap(ids)

            const enriched = result.map((i) => ({
                ...i,
                totalPaid: totalPaidMap.get(i.id) ?? 0,
                totalCredit: totalCreditMap.get(i.id) ?? 0,
            }))

            // Phase 1 — status filter applied after enrichment so "paid" filter works on computed data
            let filtered = enriched
            if (filters?.status === "paid") {
                filtered = enriched.filter((i) => {
                    if (i.status !== "issued") return false
                    const balance = i.total - i.totalPaid - i.totalCredit
                    const isCredited = i.totalPaid === 0 && i.totalCredit > 0 && balance <= 0.01
                    return balance <= 0.01 && !isCredited
                })
            } else if (filters?.status === "unpaid") {
                filtered = enriched.filter((i) => i.status === "issued" && i.totalPaid + i.totalCredit < i.total - 0.01)
            } else if (filters?.status && filters.status !== "overdue") {
                filtered = enriched.filter((i) => i.status === filters.status)
            }

            return { success: true, data: filtered }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:getOne", (_event, id: number) => {
        try {
            const db = getDb()
            const invoice = db.select().from(invoices).where(eq(invoices.id, id)).limit(1).all()[0]
            if (!invoice) return { success: false, error: "Not found" }
            const lines = getLines(id)
            const rawDb = getRawDb()
            const invoicePayments = rawDb.prepare("SELECT * FROM payments WHERE invoice_id = ?").all(id) as { amount: number }[]
            const invoiceCreditNotesRaw = rawDb.prepare("SELECT * FROM credit_notes WHERE invoice_id = ?").all(id) as {
                id: number; invoice_id: number; number: string | null; amount: number; reason: string; pdf_path: string | null; created_at: string
            }[]
            const invoiceCreditNotes = invoiceCreditNotesRaw.map((cn) => ({
                id: cn.id,
                invoiceId: cn.invoice_id,
                number: cn.number ?? undefined,
                amount: cn.amount,
                reason: cn.reason,
                pdfPath: cn.pdf_path ?? undefined,
                createdAt: cn.created_at,
            }))
            const totalPaid = invoicePayments.reduce((sum, p) => sum + p.amount, 0)
            const totalCredit = invoiceCreditNotes.reduce((sum, cn) => sum + cn.amount, 0)
            return { success: true, data: { invoice: { ...invoice, totalPaid, totalCredit }, lines, creditNotes: invoiceCreditNotes } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:nextNumber", () => {
        try {
            const db = getDb()
            const prof = db.select().from(profile).limit(1).all()[0]
            const prefix = prof?.invoicePrefix ?? ""
            const start = prof?.invoiceStartNumber ?? 1
            const year = new Date().getFullYear()
            // Preview only — does NOT increment the sequence
            const rawDb = getRawDb()
            const row = rawDb.prepare("SELECT last_sequence_number FROM invoice_sequences WHERE year = ?").get(year) as { last_sequence_number: number } | undefined
            const next = row ? row.last_sequence_number + 1 : start
            const number = `${prefix}${year}-${String(next).padStart(4, "0")}`
            return { success: true, data: number }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:create", (_event, payload: { invoice: InvoiceInput; lines: LineInput[] }) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()

            // Drafts never get an official number from the sequence engine —
            // the number is assigned at issue time. For legacy/imported invoices
            // (invoiceType === "imported") the caller provides the exact raw number.
            const inserted = db
                .insert(invoices)
                .values({ ...payload.invoice, createdAt: now, updatedAt: now })
                .returning()
                .all()[0]

            for (const line of payload.lines) {
                db.insert(invoiceLines).values({
                    invoiceId: inserted.id,
                    position: line.position,
                    label: line.label,
                    description: line.description ?? null,
                    qty: line.qty,
                    unitPrice: line.unitPrice,
                    amount: line.amount,
                    createdAt: now,
                }).run()
            }

            const lines = getLines(inserted.id)
            return { success: true, data: { invoice: { ...inserted, totalPaid: 0, totalCredit: 0 }, lines } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:update", (_event, id: number, payload: { invoice: Partial<InvoiceInput>; lines: LineInput[] }) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()

            db.update(invoices)
                .set({ ...payload.invoice, updatedAt: now })
                .where(eq(invoices.id, id))
                .run()

            db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id)).run()
            for (const line of payload.lines) {
                db.insert(invoiceLines).values({
                    invoiceId: id,
                    position: line.position,
                    label: line.label,
                    description: line.description ?? null,
                    qty: line.qty,
                    unitPrice: line.unitPrice,
                    amount: line.amount,
                    createdAt: now,
                }).run()
            }

            const updated = db.select().from(invoices).where(eq(invoices.id, id)).limit(1).all()[0]
            const lines = getLines(id)
            const totalPaidMap = buildTotalPaidMap([id])
            const totalCreditMap = buildTotalCreditMap([id])
            return { success: true, data: { invoice: { ...updated, totalPaid: totalPaidMap.get(id) ?? 0, totalCredit: totalCreditMap.get(id) ?? 0 }, lines } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Phase 1 — Issue: DRAFT → ISSUED
    // Assigns the official sequential number, auto-generates PDF, records ledger event.
    ipcMain.handle("invoices:issue", async (_event, id: number) => {
        try {
            const db = getDb()
            const invoice = db.select().from(invoices).where(eq(invoices.id, id)).limit(1).all()[0]
            if (!invoice) return { success: false, error: "Invoice not found" }
            if (invoice.status !== "draft") return { success: false, error: "Only draft invoices can be issued" }

            const prof = db.select().from(profile).limit(1).all()[0]
            const prefix = prof?.invoicePrefix ?? ""
            const start = prof?.invoiceStartNumber ?? 1
            const year = parseInt(invoice.issueDate.substring(0, 4), 10)

            // Phase 0 — transactional number assignment
            const officialNumber = generateNextInvoiceNumber(year, prefix, start)
            const now = new Date().toISOString()

            db.update(invoices)
                .set({ number: officialNumber, status: "issued", updatedAt: now })
                .where(eq(invoices.id, id))
                .run()

            // Phase 2 — auto-generate PDF with _ISSUED suffix
            let pdfPath: string | null = null
            try {
                pdfPath = await generateInvoicePdf(id, { suffix: "ISSUED" })
            } catch {
                // PDF failure is non-fatal — invoice is issued regardless
            }

            // Phase 3 — append to financial ledger
            try {
                appendLedgerEntry({
                    eventType: "invoice_issued",
                    invoiceId: id,
                    invoiceNumber: officialNumber,
                    clientName: getClientName(invoice.clientId),
                    amount: invoice.total,
                    year,
                })
            } catch {
                // Ledger failure is non-fatal
            }

            const updated = db.select().from(invoices).where(eq(invoices.id, id)).limit(1).all()[0]
            const lines = getLines(id)
            const totalPaidMap = buildTotalPaidMap([id])
            const totalCreditMap = buildTotalCreditMap([id])
            return { success: true, data: { invoice: { ...updated, totalPaid: totalPaidMap.get(id) ?? 0, totalCredit: totalCreditMap.get(id) ?? 0, pdfPath: pdfPath ?? updated.pdfPath }, lines } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Phase 1 — Void: ISSUED → VOIDED
    // Auto-generates a voided PDF with watermark.
    ipcMain.handle("invoices:void", async (_event, id: number) => {
        try {
            const db = getDb()
            const invoice = db.select().from(invoices).where(eq(invoices.id, id)).limit(1).all()[0]
            if (!invoice) return { success: false, error: "Invoice not found" }
            if (invoice.status !== "issued") return { success: false, error: "Only issued invoices can be voided" }

            const now = new Date().toISOString()
            db.update(invoices).set({ status: "voided", updatedAt: now }).where(eq(invoices.id, id)).run()

            // Phase 2 — auto-generate voided PDF with watermark
            try {
                await generateInvoicePdf(id, { suffix: "VOIDED", watermark: "VOID / ANNULÉ" })
            } catch {
                // Non-fatal
            }

            const updated = db.select().from(invoices).where(eq(invoices.id, id)).limit(1).all()[0]
            const lines = getLines(id)
            const totalPaidMap = buildTotalPaidMap([id])
            const totalCreditMap = buildTotalCreditMap([id])
            return { success: true, data: { invoice: { ...updated, totalPaid: totalPaidMap.get(id) ?? 0, totalCredit: totalCreditMap.get(id) ?? 0 }, lines } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Phase 1 — Add credit note (client backed out / price adjustment)
    ipcMain.handle("invoices:addCreditNote", async (_event, data: { invoiceId: number; amount: number; reason: string }) => {
        try {
            const db = getDb()
            const rawDb = getRawDb()
            const invoice = db.select().from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1).all()[0]
            if (!invoice) return { success: false, error: "Invoice not found" }
            if (invoice.status !== "issued") return { success: false, error: "Credit notes only apply to issued invoices" }

            const now = new Date().toISOString()
            const today = now.substring(0, 10)
            const year = parseInt(invoice.issueDate.substring(0, 4), 10)

            const cnNumber = getNextCreditNoteNumber(year)

            // Generate credit note PDF
            let pdfPath: string | null = null
            try {
                const prof = db.select().from(profile).limit(1).all()[0]
                const client = db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1).all()[0]
                const locale = prof?.locale ?? "fr-CA"

                const html = buildCreditNoteHtml({
                    cnNumber,
                    cnDate: today,
                    locale,
                    issuerName: prof?.name ?? "",
                    issuerAddress: prof?.address ?? "",
                    clientName: client?.companyName ?? client?.name ?? "",
                    clientAddress: client?.address ?? "",
                    invoiceNumber: invoice.number,
                    amount: data.amount,
                    reason: data.reason,
                })

                const userSlug = buildSlug(prof?.name ?? "user")
                const clientSlug = buildSlug(client?.companyName ?? client?.name ?? "client")
                const cnSlug = cnNumber.toLowerCase().replace(/[^a-z0-9]/g, "-")
                const destDir = join(getDataRootPath(), "attachments", "invoices", String(year))
                mkdirSync(destDir, { recursive: true })
                const destPath = resolveDestPath(destDir, `credit-note_${userSlug}_${cnSlug}_${clientSlug}_${today}.pdf`)

                const browser = await puppeteer.launch({ headless: true })
                const page = await browser.newPage()
                await page.setContent(html, { waitUntil: "networkidle0" })
                await page.pdf({ path: destPath, format: "A4", printBackground: true, margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" } })
                await browser.close()
                pdfPath = destPath
            } catch {
                // Non-fatal — credit note recorded even if PDF fails
            }

            db.insert(creditNotes).values({
                invoiceId: data.invoiceId,
                number: cnNumber,
                amount: data.amount,
                reason: data.reason,
                pdfPath: pdfPath ?? undefined,
                createdAt: now,
            }).run()

            // Append to financial ledger (negative amount = reduction)
            try {
                appendLedgerEntry({
                    eventType: "credit_note",
                    invoiceId: data.invoiceId,
                    invoiceNumber: invoice.number,
                    clientName: getClientName(invoice.clientId),
                    amount: -data.amount,
                    year,
                })
            } catch {
                // Non-fatal
            }

            // Generate a separate CRÉDITÉ watermark copy (never overwrites the original)
            try {
                await generateInvoicePdf(data.invoiceId, { suffix: "CREDITED", watermark: "CRÉDITÉ / CREDITED", updateField: "creditedPdfPath" })
            } catch {
                // Non-fatal
            }

            const allCreditNotesRaw = rawDb.prepare("SELECT * FROM credit_notes WHERE invoice_id = ?").all(data.invoiceId) as {
                id: number; invoice_id: number; number: string | null; amount: number; reason: string; pdf_path: string | null; created_at: string
            }[]
            const allCreditNotes = allCreditNotesRaw.map((cn) => ({
                id: cn.id,
                invoiceId: cn.invoice_id,
                number: cn.number ?? undefined,
                amount: cn.amount,
                reason: cn.reason,
                pdfPath: cn.pdf_path ?? undefined,
                createdAt: cn.created_at,
            }))
            const totalPaidMap = buildTotalPaidMap([data.invoiceId])
            const totalCreditMap = buildTotalCreditMap([data.invoiceId])
            const updated = db.select().from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1).all()[0]
            return { success: true, data: { invoice: { ...updated, totalPaid: totalPaidMap.get(data.invoiceId) ?? 0, totalCredit: totalCreditMap.get(data.invoiceId) ?? 0 }, creditNotes: allCreditNotes } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Sync the sequence counter after importing a historical invoice (only advances, never rewinds)
    ipcMain.handle("invoices:syncSequenceFromImport", (_event, number: string, year: number) => {
        try {
            const segments = number.split(/[^0-9]+/).filter((s) => s.length > 0)
            if (!segments.length) return { success: true }
            const seq = parseInt(segments[segments.length - 1], 10)
            if (!seq || seq <= 0) return { success: true }
            getRawDb()
                .prepare(`
                    INSERT INTO invoice_sequences (year, last_sequence_number)
                    VALUES (?, ?)
                    ON CONFLICT(year) DO UPDATE SET
                        last_sequence_number = MAX(last_sequence_number, excluded.last_sequence_number)
                `)
                .run(year, seq)
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Phase 4 — check whether an exact invoice number already exists (for legacy entry collision detection)
    ipcMain.handle("invoices:checkNumberExists", (_event, number: string) => {
        try {
            const rawDb = getRawDb()
            const row = rawDb.prepare("SELECT id FROM invoices WHERE number = ?").get(number.trim())
            return { success: true, data: { exists: !!row } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:updateStatus", (_event, id: number, status: string) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()
            db.update(invoices).set({ status, updatedAt: now }).where(eq(invoices.id, id)).run()
            const updated = db.select().from(invoices).where(eq(invoices.id, id)).limit(1).all()[0]
            const totalPaidMap = buildTotalPaidMap([id])
            const totalCreditMap = buildTotalCreditMap([id])
            return { success: true, data: { ...updated, totalPaid: totalPaidMap.get(id) ?? 0, totalCredit: totalCreditMap.get(id) ?? 0 } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:reopen", (_event, id: number) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()
            // Assign a fresh draft placeholder number so the detail view shows something
            db.update(invoices)
                .set({ status: "draft", pdfPath: null, updatedAt: now })
                .where(eq(invoices.id, id))
                .run()
            const updated = db.select().from(invoices).where(eq(invoices.id, id)).limit(1).all()[0]
            const lines = getLines(id)
            const totalPaidMap = buildTotalPaidMap([id])
            const totalCreditMap = buildTotalCreditMap([id])
            return { success: true, data: { invoice: { ...updated, totalPaid: totalPaidMap.get(id) ?? 0, totalCredit: totalCreditMap.get(id) ?? 0 }, lines } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:getAttachments", (_event, invoiceId: number) => {
        try {
            const db = getDb()
            const result = db.select().from(invoiceAttachments).where(eq(invoiceAttachments.invoiceId, invoiceId)).all()
            return { success: true, data: result }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:addAttachment", (_event, data: { invoiceId: number; sourcePath: string; type: string }) => {
        try {
            const db = getDb()
            const invoice = db.select().from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1).all()[0]
            if (!invoice) return { success: false, error: "Invoice not found" }
            const client = db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1).all()[0]
            const prof = db.select().from(profile).limit(1).all()[0]

            const year = invoice.issueDate.substring(0, 4)
            const userSlug = buildSlug(prof?.name ?? "user")
            const clientSlug = buildSlug(client?.companyName ?? client?.name ?? "client")
            const originalName = basename(data.sourcePath)
            const newName = `hours-proof_${userSlug}_${invoice.number}_${clientSlug}_${originalName}`

            const destDir = join(getDataRootPath(), "attachments", "invoices", year)
            if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
            const destPath = resolveDestPath(destDir, newName)
            copyFileSync(data.sourcePath, destPath)

            const now = new Date().toISOString()
            const result = db.insert(invoiceAttachments).values({
                invoiceId: data.invoiceId,
                name: basename(destPath),
                path: destPath,
                type: data.type,
                createdAt: now,
            }).returning().all()
            return { success: true, data: result[0] }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:attachImportedPdf", (_event, data: { invoiceId: number; sourcePath: string }) => {
        try {
            const db = getDb()
            const invoice = db.select().from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1).all()[0]
            if (!invoice) return { success: false, error: "Invoice not found" }
            const client = db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1).all()[0]
            const prof = db.select().from(profile).limit(1).all()[0]

            const year = invoice.issueDate.substring(0, 4)
            const userSlug = buildSlug(prof?.name ?? "user")
            const clientSlug = buildSlug(client?.companyName ?? client?.name ?? "client")
            const ext = extname(data.sourcePath) || ".pdf"
            const fileName = `invoice_${userSlug}_${invoice.number}_${clientSlug}_${invoice.issueDate}${ext}`

            const destDir = join(getDataRootPath(), "attachments", "invoices", year)
            if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
            const destPath = join(destDir, fileName)
            copyFileSync(data.sourcePath, destPath)

            const now = new Date().toISOString()
            db.update(invoices).set({ pdfPath: destPath, updatedAt: now }).where(eq(invoices.id, data.invoiceId)).run()
            db.insert(invoiceAttachments).values({
                invoiceId: data.invoiceId,
                name: fileName,
                path: destPath,
                type: "imported_pdf",
                createdAt: now,
            }).run()

            return { success: true, data: destPath }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:deleteAttachment", (_event, id: number) => {
        try {
            const db = getDb()
            const attachment = db.select().from(invoiceAttachments).where(eq(invoiceAttachments.id, id)).limit(1).all()[0]
            if (!attachment) return { success: false, error: "Attachment not found" }
            if (existsSync(attachment.path)) unlinkSync(attachment.path)
            db.delete(invoiceAttachments).where(eq(invoiceAttachments.id, id)).run()
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })
}
