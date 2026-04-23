import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core"
import { drizzle } from "drizzle-orm/better-sqlite3"
import Database from "better-sqlite3"
import { join } from "path"
import { app } from "electron"
import { existsSync, mkdirSync } from "fs"

export const profile = sqliteTable("profile", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    phone: text("phone"),
    email: text("email"),
    gstNumber: text("gst_number"),
    qstNumber: text("qst_number"),
    defaultHourlyRate: real("default_hourly_rate").notNull().default(23),
    invoiceStartNumber: integer("invoice_start_number").notNull().default(1),
    invoiceNumberFormat: text("invoice_number_format").notNull().default("YYYY-NNN"),
    dataRootPath: text("data_root_path"),
    logoPath: text("logo_path"),
    locale: text("locale").notNull().default("fr-CA"),
    backupIntervalDays: integer("backup_interval_days").notNull().default(7),
    backupRetentionCount: integer("backup_retention_count").notNull().default(10),
    lateInvoiceAlertDays: integer("late_invoice_alert_days").notNull().default(30),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
})

export const clients = sqliteTable("clients", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    companyName: text("company_name"),
    address: text("address").notNull(),
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
    hoursWeek1: real("hours_week1").notNull(),
    hoursWeek2: real("hours_week2").notNull(),
    totalHours: real("total_hours").notNull(),
    hourlyRate: real("hourly_rate").notNull(),
    subtotal: real("subtotal").notNull(),
    gstRate: real("gst_rate").notNull().default(0),
    qstRate: real("qst_rate").notNull().default(0),
    gstAmount: real("gst_amount").notNull().default(0),
    qstAmount: real("qst_amount").notNull().default(0),
    total: real("total").notNull(),
    description: text("description").notNull(),
    additionalLines: text("additional_lines"),
    invoiceType: text("invoice_type").notNull().default("weekly"),
    status: text("status").notNull().default("draft"),
    notes: text("notes"),
    pdfPath: text("pdf_path"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
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
    const documentsPath = app.getPath("documents")
    return join(documentsPath, "ArmyaFacturation")
}

export function initDatabase(): void {
    const dataPath = getDataRootPath()
    if (!existsSync(dataPath)) {
        mkdirSync(dataPath, { recursive: true })
    }

    const dbPath = join(dataPath, "armya.db")
    rawDb = new Database(dbPath)
    rawDb.pragma("journal_mode = WAL")
    rawDb.pragma("foreign_keys = ON")

    dbInstance = drizzle(rawDb)
    runMigrations(rawDb)
}

export function getDb(): ReturnType<typeof drizzle> {
    if (!dbInstance) throw new Error("Database not initialized")
    return dbInstance
}

export function getRawDb(): Database.Database {
    if (!rawDb) throw new Error("Database not initialized")
    return rawDb
}

function runMigrations(db: Database.Database): void {
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
            data_root_path TEXT,
            logo_path TEXT,
            locale TEXT NOT NULL DEFAULT 'fr-CA',
            backup_interval_days INTEGER NOT NULL DEFAULT 7,
            backup_retention_count INTEGER NOT NULL DEFAULT 10,
            late_invoice_alert_days INTEGER NOT NULL DEFAULT 30,
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
            hours_week1 REAL NOT NULL,
            hours_week2 REAL NOT NULL,
            total_hours REAL NOT NULL,
            hourly_rate REAL NOT NULL,
            subtotal REAL NOT NULL,
            gst_rate REAL NOT NULL DEFAULT 0,
            qst_rate REAL NOT NULL DEFAULT 0,
            gst_amount REAL NOT NULL DEFAULT 0,
            qst_amount REAL NOT NULL DEFAULT 0,
            total REAL NOT NULL,
            description TEXT NOT NULL,
            additional_lines TEXT,
            invoice_type TEXT NOT NULL DEFAULT 'weekly',
            status TEXT NOT NULL DEFAULT 'draft',
            notes TEXT,
            pdf_path TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
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

    try {
        db.exec(`ALTER TABLE invoices ADD COLUMN invoice_type TEXT NOT NULL DEFAULT 'weekly'`)
    } catch {
        // Column already exists — safe to ignore
    }
}
