import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core"
import { drizzle } from "drizzle-orm/better-sqlite3"
import Database from "better-sqlite3"
import { join } from "path"
import { app } from "electron"
import { existsSync, mkdirSync } from "fs"
import { is } from "@electron-toolkit/utils"

export const profile = sqliteTable("profile", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    addressLine2: text("address_line2"),
    appPin: text("app_pin"),
    touchIdEnabled: integer("touch_id_enabled").notNull().default(0),
    phone: text("phone"),
    email: text("email"),
    gstNumber: text("gst_number"),
    qstNumber: text("qst_number"),
    defaultHourlyRate: real("default_hourly_rate").notNull().default(23),
    invoiceStartNumber: integer("invoice_start_number").notNull().default(1),
    invoiceNumberFormat: text("invoice_number_format").notNull().default("YYYY-NNN"),
    invoicePrefix: text("invoice_prefix").notNull().default(""),
    city: text("city"),
    province: text("province"),
    country: text("country"),
    postalCode: text("postal_code"),
    dataRootPath: text("data_root_path"),
    logoPath: text("logo_path"),
    locale: text("locale").notNull().default("fr-CA"),
    backupIntervalDays: integer("backup_interval_days").notNull().default(7),
    backupRetentionCount: integer("backup_retention_count").notNull().default(1),
    lateInvoiceAlertDays: integer("late_invoice_alert_days").notNull().default(30),
    taxReserveRate: real("tax_reserve_rate").notNull().default(0.20),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
})

// Phase 0 — annual sequence tracker (one row per calendar year)
export const invoiceSequences = sqliteTable("invoice_sequences", {
    year: integer("year").primaryKey(),
    lastSequenceNumber: integer("last_sequence_number").notNull().default(0),
})

// Phase 1 — credit notes (append-only; reduce balance-due without touching cash flow)
export const creditNotes = sqliteTable("credit_notes", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
    number: text("number"),
    amount: real("amount").notNull(),
    reason: text("reason").notNull(),
    pdfPath: text("pdf_path"),
    createdAt: text("created_at").notNull(),
})

// Phase 3 — immutable financial ledger (INSERT only; never UPDATE or DELETE)
export const financialLedger = sqliteTable("financial_ledger", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventType: text("event_type").notNull(), // invoice_issued | payment_received | credit_note | refund
    invoiceId: integer("invoice_id").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    clientName: text("client_name").notNull(),
    amount: real("amount").notNull(),
    runningTotal: real("running_total").notNull(),
    year: integer("year").notNull(),
    createdAt: text("created_at").notNull(),
})

export const clients = sqliteTable("clients", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    companyName: text("company_name"),
    address: text("address").notNull(),
    addressLine2: text("address_line2"),
    city: text("city"),
    province: text("province"),
    postalCode: text("postal_code"),
    phone: text("phone"),
    email: text("email"),
    primaryContact: text("primary_contact"),
    billingType: text("billing_type").notNull().default("hourly"),
    hourlyRate: real("hourly_rate"),
    defaultHoursPerPeriod: real("default_hours_per_period"),
    billingFrequency: text("billing_frequency").notNull().default("biweekly"),
    active: integer("active").notNull().default(1),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
})

export const invoices = sqliteTable("invoices", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    number: text("number").notNull().unique(),
    clientId: integer("client_id")
        .notNull()
        .references(() => clients.id),
    issueDate: text("issue_date").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    invoiceType: text("invoice_type").notNull().default("weekly"),
    description: text("description").notNull(),
    subtotal: real("subtotal").notNull(),
    gstRate: real("gst_rate").notNull().default(0),
    qstRate: real("qst_rate").notNull().default(0),
    gstAmount: real("gst_amount").notNull().default(0),
    qstAmount: real("qst_amount").notNull().default(0),
    total: real("total").notNull(),
    dueDate: text("due_date"),
    status: text("status").notNull().default("draft"),
    notes: text("notes"),
    pdfPath: text("pdf_path"),
    creditedPdfPath: text("credited_pdf_path"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
})

export const invoiceLines = sqliteTable("invoice_lines", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    invoiceId: integer("invoice_id")
        .notNull()
        .references(() => invoices.id),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    qty: real("qty").notNull().default(0),
    unitPrice: real("unit_price").notNull().default(0),
    amount: real("amount").notNull().default(0),
    createdAt: text("created_at").notNull(),
})

export const invoiceAttachments = sqliteTable("invoice_attachments", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    invoiceId: integer("invoice_id")
        .notNull()
        .references(() => invoices.id),
    name: text("name").notNull(),
    path: text("path").notNull(),
    type: text("type").notNull(),
    createdAt: text("created_at").notNull(),
})

export const payments = sqliteTable("payments", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    invoiceId: integer("invoice_id")
        .notNull()
        .references(() => invoices.id),
    paymentDate: text("payment_date").notNull(),
    amount: real("amount").notNull(),
    paymentMethod: text("payment_method").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    proofPath: text("proof_path"),
    receiptNumber: text("receipt_number"),
    receiptPath: text("receipt_path"),
    createdAt: text("created_at").notNull(),
})

export const expenses = sqliteTable("expenses", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    amount: real("amount").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    deductibleRate: real("deductible_rate").notNull().default(1),
    gstPaid: real("gst_paid").notNull().default(0),
    qstPaid: real("qst_paid").notNull().default(0),
    receiptPath: text("receipt_path"),
    notes: text("notes"),
    year: integer("year").notNull(),
    createdAt: text("created_at").notNull(),
})

let dbInstance: ReturnType<typeof drizzle> | null = null
let rawDb: Database.Database | null = null

export function getDataRootPath(): string {
    if (is.dev) return join(app.getAppPath(), "dev-data")
    const documentsPath = app.getPath("documents")
    return join(documentsPath, "Autonomo")
}

export function initDatabase(skipStaleCleanup = false): void {
    const dataPath = getDataRootPath()
    if (!existsSync(dataPath)) {
        mkdirSync(dataPath, { recursive: true })
    }

    const dbPath = join(dataPath, "autonomo.db")
    rawDb = new Database(dbPath)
    rawDb.pragma("journal_mode = WAL")
    rawDb.pragma("foreign_keys = ON")

    dbInstance = drizzle(rawDb)
    runMigrations(rawDb, skipStaleCleanup)
}

export function getDb(): ReturnType<typeof drizzle> {
    if (!dbInstance) throw new Error("Database not initialized")
    return dbInstance
}

export function getRawDb(): Database.Database {
    if (!rawDb) throw new Error("Database not initialized")
    return rawDb
}

export function closeDatabase(): void {
    if (rawDb) {
        rawDb.close()
        rawDb = null
        dbInstance = null
    }
}

export function reinitDatabase(): void {
    closeDatabase()
    initDatabase(true)
}

function runMigrations(db: Database.Database, skipStaleCleanup = false): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS profile (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            address TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            gst_number TEXT,
            qst_number TEXT,
            default_hourly_rate REAL NOT NULL DEFAULT 23,
            invoice_start_number INTEGER NOT NULL DEFAULT 1,
            invoice_number_format TEXT NOT NULL DEFAULT 'YYYY-NNN',
            city TEXT,
            province TEXT,
            country TEXT,
            postal_code TEXT,
            data_root_path TEXT,
            logo_path TEXT,
            locale TEXT NOT NULL DEFAULT 'fr-CA',
            backup_interval_days INTEGER NOT NULL DEFAULT 7,
            backup_retention_count INTEGER NOT NULL DEFAULT 1,
            late_invoice_alert_days INTEGER NOT NULL DEFAULT 30,
            tax_reserve_rate REAL NOT NULL DEFAULT 0.20,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            company_name TEXT,
            address TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            primary_contact TEXT,
            billing_type TEXT NOT NULL DEFAULT 'hourly',
            hourly_rate REAL,
            default_hours_per_period REAL,
            billing_frequency TEXT NOT NULL DEFAULT 'biweekly',
            active INTEGER NOT NULL DEFAULT 1,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            number TEXT NOT NULL UNIQUE,
            client_id INTEGER NOT NULL REFERENCES clients(id),
            issue_date TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            invoice_type TEXT NOT NULL DEFAULT 'weekly',
            description TEXT NOT NULL,
            subtotal REAL NOT NULL,
            gst_rate REAL NOT NULL DEFAULT 0,
            qst_rate REAL NOT NULL DEFAULT 0,
            gst_amount REAL NOT NULL DEFAULT 0,
            qst_amount REAL NOT NULL DEFAULT 0,
            total REAL NOT NULL,
            due_date TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            notes TEXT,
            pdf_path TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS invoice_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            label TEXT NOT NULL,
            description TEXT,
            qty REAL NOT NULL DEFAULT 0,
            unit_price REAL NOT NULL DEFAULT 0,
            amount REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS invoice_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL REFERENCES invoices(id),
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            type TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL REFERENCES invoices(id),
            payment_date TEXT NOT NULL,
            amount REAL NOT NULL,
            payment_method TEXT NOT NULL,
            reference TEXT,
            notes TEXT,
            proof_path TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            deductible_rate REAL NOT NULL DEFAULT 1,
            gst_paid REAL NOT NULL DEFAULT 0,
            qst_paid REAL NOT NULL DEFAULT 0,
            receipt_path TEXT,
            notes TEXT,
            year INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
    `)

    // Phase 0 — invoice sequence tracker
    db.exec(`
        CREATE TABLE IF NOT EXISTS invoice_sequences (
            year INTEGER PRIMARY KEY,
            last_sequence_number INTEGER NOT NULL DEFAULT 0
        );
    `)

    // Phase 1 — credit notes
    db.exec(`
        CREATE TABLE IF NOT EXISTS credit_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL REFERENCES invoices(id),
            amount REAL NOT NULL,
            reason TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
    `)

    // Phase 3 — immutable financial ledger
    db.exec(`
        CREATE TABLE IF NOT EXISTS financial_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            invoice_id INTEGER NOT NULL,
            invoice_number TEXT NOT NULL,
            client_name TEXT NOT NULL,
            amount REAL NOT NULL,
            running_total REAL NOT NULL,
            year INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
    `)

    // Idempotent profile columns (existing databases)
    for (const sql of [
        `ALTER TABLE profile ADD COLUMN city TEXT`,
        `ALTER TABLE profile ADD COLUMN province TEXT`,
        `ALTER TABLE profile ADD COLUMN country TEXT`,
        `ALTER TABLE profile ADD COLUMN postal_code TEXT`,
        `ALTER TABLE profile ADD COLUMN tax_reserve_rate REAL NOT NULL DEFAULT 0.20`,
        `ALTER TABLE invoices ADD COLUMN due_date TEXT`,
        `ALTER TABLE profile ADD COLUMN app_pin TEXT`,
        `ALTER TABLE profile ADD COLUMN touch_id_enabled INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE profile ADD COLUMN invoice_prefix TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE credit_notes ADD COLUMN number TEXT`,
        `ALTER TABLE credit_notes ADD COLUMN pdf_path TEXT`,
        `ALTER TABLE invoices ADD COLUMN credited_pdf_path TEXT`,
        `ALTER TABLE payments ADD COLUMN receipt_number TEXT`,
        `ALTER TABLE payments ADD COLUMN receipt_path TEXT`,
        `ALTER TABLE profile ADD COLUMN address_line2 TEXT`,
        `ALTER TABLE clients ADD COLUMN address_line2 TEXT`,
        `ALTER TABLE clients ADD COLUMN city TEXT`,
        `ALTER TABLE clients ADD COLUMN province TEXT`,
        `ALTER TABLE clients ADD COLUMN postal_code TEXT`,
    ]) {
        try { db.exec(sql) } catch { /* already exists */ }
    }

    // Phase 1 — status migration: populate invoice_sequences from existing numbers,
    // then normalize status values to the new document-lifecycle model.

    // Step 1: For invoices currently "paid" with no payment records, create synthetic payments
    // so the computed payment status stays correct after we drop "paid" as a DB status.
    db.exec(`
        INSERT INTO payments (invoice_id, payment_date, amount, payment_method, reference, notes, created_at)
        SELECT id, issue_date, total, 'other', NULL,
               'Paiement migré automatiquement',
               datetime('now')
        FROM invoices
        WHERE status = 'paid'
          AND id NOT IN (SELECT DISTINCT invoice_id FROM payments)
    `)

    // Step 2: Normalize status values
    db.exec("UPDATE invoices SET status = 'issued' WHERE status = 'sent'")
    db.exec("UPDATE invoices SET status = 'issued' WHERE status = 'paid'")
    db.exec("UPDATE invoices SET status = 'voided' WHERE status = 'refused'")
    db.exec("UPDATE invoices SET status = 'voided' WHERE status = 'cancelled'")
    // overdue was already computed; any lingering rows become issued
    db.exec("UPDATE invoices SET status = 'issued' WHERE status = 'overdue'")

    // Step 3: Seed invoice_sequences from existing invoice numbers so the generator
    // continues from the right place rather than restarting at 1.
    const existingNumbers = db.prepare("SELECT number FROM invoices WHERE status != 'draft'").all() as { number: string }[]
    const yearSeqMap = new Map<number, number>()
    for (const { number } of existingNumbers) {
        const yearMatch = number.match(/(\d{4})[-_](\d+)$/)
        if (!yearMatch) continue
        const year = parseInt(yearMatch[1], 10)
        const seq = parseInt(yearMatch[2], 10)
        if (!isNaN(year) && !isNaN(seq)) {
            yearSeqMap.set(year, Math.max(yearSeqMap.get(year) ?? 0, seq))
        }
    }
    const upsertSeq = db.prepare(
        `INSERT INTO invoice_sequences (year, last_sequence_number) VALUES (?, ?)
         ON CONFLICT(year) DO UPDATE SET last_sequence_number = MAX(last_sequence_number, excluded.last_sequence_number)`
    )
    for (const [year, seq] of yearSeqMap) {
        upsertSeq.run(year, seq)
    }

    if (skipStaleCleanup) return

    // Stale path cleanup — NULL/delete records pointing to files that no longer exist on disk.
    // Runs every startup, safe because it only touches missing files.
    const staleInvoices = db.prepare(
        "SELECT id, pdf_path FROM invoices WHERE pdf_path IS NOT NULL"
    ).all() as { id: number; pdf_path: string }[]
    for (const row of staleInvoices) {
        if (!existsSync(row.pdf_path)) {
            db.prepare("UPDATE invoices SET pdf_path = NULL WHERE id = ?").run(row.id)
        }
    }

    const staleExpenses = db.prepare(
        "SELECT id, receipt_path FROM expenses WHERE receipt_path IS NOT NULL"
    ).all() as { id: number; receipt_path: string }[]
    for (const row of staleExpenses) {
        if (!existsSync(row.receipt_path)) {
            db.prepare("UPDATE expenses SET receipt_path = NULL WHERE id = ?").run(row.id)
        }
    }

    const stalePayments = db.prepare(
        "SELECT id, proof_path FROM payments WHERE proof_path IS NOT NULL"
    ).all() as { id: number; proof_path: string }[]
    for (const row of stalePayments) {
        if (!existsSync(row.proof_path)) {
            db.prepare("UPDATE payments SET proof_path = NULL WHERE id = ?").run(row.id)
        }
    }

    const staleAttachments = db.prepare(
        "SELECT id, path FROM invoice_attachments"
    ).all() as { id: number; path: string }[]
    for (const row of staleAttachments) {
        if (!existsSync(row.path)) {
            db.prepare("DELETE FROM invoice_attachments WHERE id = ?").run(row.id)
        }
    }
}
