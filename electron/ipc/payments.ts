import { ipcMain } from "electron"
import { eq } from "drizzle-orm"
import { getDb, payments, invoices, clients, profile, getDataRootPath } from "../../db/schema"
import { copyFileSync, mkdirSync, existsSync } from "fs"
import { join, basename } from "path"
import { buildSlug, resolveDestPath } from "./utils"

// Recomputes invoice status based on total payments recorded.
// - totalPaid >= invoice.total  AND status !== "paid"  → mark as "paid"
// - totalPaid <  invoice.total  AND status === "paid"  → revert to "sent"
// Only touches invoices in an active payment-eligible state (sent, overdue, paid).
function syncInvoiceStatus(invoiceId: number, now: string): void {
    const db = getDb()
    const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1).all()[0]
    if (!invoice) return
    if (invoice.status !== "sent" && invoice.status !== "overdue" && invoice.status !== "paid") return

    const allPayments = db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).all()
    const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0)

    const epsilon = 0.01
    if (totalPaid >= invoice.total - epsilon && invoice.status !== "paid") {
        db.update(invoices).set({ status: "paid", updatedAt: now }).where(eq(invoices.id, invoiceId)).run()
    } else if (totalPaid < invoice.total - epsilon && invoice.status === "paid") {
        db.update(invoices).set({ status: "sent", updatedAt: now }).where(eq(invoices.id, invoiceId)).run()
    }
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

    ipcMain.handle("payments:create", (_event, data: {
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
            syncInvoiceStatus(data.invoiceId, now)
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
            const now = new Date().toISOString()
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
            if (updatedPayment) syncInvoiceStatus(updatedPayment.invoiceId, now)
            return { success: true, data: updatedPayment }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("payments:delete", (_event, id: number) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()
            const payment = db.select().from(payments).where(eq(payments.id, id)).limit(1).all()[0]
            db.delete(payments).where(eq(payments.id, id)).run()
            if (payment) syncInvoiceStatus(payment.invoiceId, now)
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
