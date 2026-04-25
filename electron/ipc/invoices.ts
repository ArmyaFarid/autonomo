import { ipcMain } from "electron"
import { eq, desc } from "drizzle-orm"
import { getDb, invoices, invoiceLines, invoiceAttachments, clients, profile } from "../../db/schema"
import { copyFileSync, mkdirSync, existsSync, unlinkSync } from "fs"
import { join, basename, extname } from "path"
import { getDataRootPath } from "../../db/schema"
import { buildSlug, resolveDestPath } from "./utils"

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

function generateInvoiceNumber(format: string, startNumber: number, existingNumbers: string[]): string {
    const year = new Date().getFullYear().toString()
    // Build the fixed prefix for the current year (everything before the N-block)
    // e.g. "YYYY-NNN" → "2026-", "FACNNN-YYYY" → "FAC" + year suffix varies, so we keep it simple
    const nMatch = format.match(/N+/)
    const padLen = nMatch ? nMatch[0].length : 3
    const prefix = format.replace("YYYY", year).replace(/N+.*$/, "")

    let maxSeq = startNumber - 1
    for (const n of existingNumbers) {
        if (n.startsWith(prefix)) {
            const seq = parseInt(n.slice(prefix.length), 10)
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq
        }
    }

    const next = Math.max(startNumber, maxSeq + 1)
    return format.replace("YYYY", year).replace(/N+/, next.toString().padStart(padLen, "0"))
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

export function registerInvoiceHandlers(): void {
    ipcMain.handle("invoices:getAll", (_event, filters?: { clientId?: number; status?: string; year?: number }) => {
        try {
            const db = getDb()
            const result = db.select().from(invoices).orderBy(desc(invoices.createdAt)).all()
            let filtered = result
            if (filters?.clientId) filtered = filtered.filter((i) => i.clientId === filters.clientId)
            if (filters?.status) filtered = filtered.filter((i) => i.status === filters.status)
            if (filters?.year) filtered = filtered.filter((i) => i.issueDate.startsWith(String(filters.year)))
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
            return { success: true, data: { invoice, lines } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:nextNumber", () => {
        try {
            const db = getDb()
            const prof = db.select().from(profile).limit(1).all()
            const allNumbers = db.select({ number: invoices.number }).from(invoices).all().map((i) => i.number)
            const format = prof[0]?.invoiceNumberFormat ?? "YYYY-NNN"
            const start = prof[0]?.invoiceStartNumber ?? 1
            const number = generateInvoiceNumber(format, start, allNumbers)
            return { success: true, data: number }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:create", (_event, payload: { invoice: InvoiceInput; lines: LineInput[] }) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()
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
            return { success: true, data: { invoice: inserted, lines } }
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
            return { success: true, data: { invoice: updated, lines } }
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
            return { success: true, data: updated }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("invoices:reopen", (_event, id: number) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()
            db.update(invoices)
                .set({ status: "draft", pdfPath: null, updatedAt: now })
                .where(eq(invoices.id, id))
                .run()
            const updated = db.select().from(invoices).where(eq(invoices.id, id)).limit(1).all()[0]
            const lines = getLines(id)
            return { success: true, data: { invoice: updated, lines } }
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
