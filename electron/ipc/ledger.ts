import { getRawDb } from "../../db/schema"
import { join } from "path"
import { existsSync, mkdirSync, appendFileSync } from "fs"
import { getDataRootPath } from "../../db/schema"

export type LedgerEventType = "invoice_issued" | "payment_received" | "credit_note" | "refund"

interface LedgerEventInput {
    eventType: LedgerEventType
    invoiceId: number
    invoiceNumber: string
    clientName: string
    amount: number
    year: number
}

export function appendLedgerEntry(event: LedgerEventInput): void {
    const rawDb = getRawDb()

    const prevRow = rawDb.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM financial_ledger WHERE year = ?"
    ).get(event.year) as { total: number }

    const runningTotal = prevRow.total + event.amount
    const now = new Date().toISOString()

    rawDb.prepare(
        `INSERT INTO financial_ledger
         (event_type, invoice_id, invoice_number, client_name, amount, running_total, year, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(event.eventType, event.invoiceId, event.invoiceNumber, event.clientName, event.amount, runningTotal, event.year, now)

    try {
        appendToTaxCsv(event, runningTotal, now)
    } catch {
        // CSV failure is non-fatal — the DB record is the authoritative source
    }
}

function appendToTaxCsv(event: LedgerEventInput, runningTotal: number, timestamp: string): void {
    const exportsDir = join(getDataRootPath(), "exports")
    if (!existsSync(exportsDir)) mkdirSync(exportsDir, { recursive: true })

    const csvPath = join(exportsDir, `Tax_Ledger_${event.year}.csv`)
    const dateStr = timestamp.substring(0, 10)

    if (!existsSync(csvPath)) {
        appendFileSync(csvPath, "Date,Type d'événement,Numéro de référence,Client,Montant,Total cumulé\n", "utf-8")
    }

    const eventLabel: Record<LedgerEventType, string> = {
        invoice_issued: "Facture émise",
        payment_received: "Paiement reçu",
        credit_note: "Note de crédit",
        refund: "Remboursement",
    }

    const safeClient = event.clientName.replace(/"/g, '""')
    const row = [
        dateStr,
        eventLabel[event.eventType],
        event.invoiceNumber,
        `"${safeClient}"`,
        event.amount.toFixed(2),
        runningTotal.toFixed(2),
    ].join(",") + "\n"

    appendFileSync(csvPath, row, "utf-8")
}
