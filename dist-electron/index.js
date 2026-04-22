"use strict";
const electron = require("electron");
const path = require("path");
const sqliteCore = require("drizzle-orm/sqlite-core");
const betterSqlite3 = require("drizzle-orm/better-sqlite3");
const Database = require("better-sqlite3");
const fs = require("fs");
const drizzleOrm = require("drizzle-orm");
const puppeteer = require("puppeteer");
const AdmZip = require("adm-zip");
const crypto = require("crypto");
const is = {
  dev: !electron.app.isPackaged
};
const platform = {
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
};
const electronApp = {
  setAppUserModelId(id) {
    if (platform.isWindows)
      electron.app.setAppUserModelId(is.dev ? process.execPath : id);
  },
  setAutoLaunch(auto) {
    if (platform.isLinux)
      return false;
    const isOpenAtLogin = () => {
      return electron.app.getLoginItemSettings().openAtLogin;
    };
    if (isOpenAtLogin() !== auto) {
      electron.app.setLoginItemSettings({
        openAtLogin: auto,
        path: process.execPath
      });
      return isOpenAtLogin() === auto;
    } else {
      return true;
    }
  },
  skipProxy() {
    return electron.session.defaultSession.setProxy({ mode: "direct" });
  }
};
const optimizer = {
  watchWindowShortcuts(window, shortcutOptions) {
    if (!window)
      return;
    const { webContents } = window;
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {};
    webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown") {
        if (!is.dev) {
          if (input.code === "KeyR" && (input.control || input.meta))
            event.preventDefault();
        } else {
          if (input.code === "F12") {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools();
            } else {
              webContents.openDevTools({ mode: "undocked" });
              console.log("Open dev tool...");
            }
          }
        }
        if (escToCloseWindow) {
          if (input.code === "Escape" && input.key !== "Process") {
            window.close();
            event.preventDefault();
          }
        }
        if (!zoom) {
          if (input.code === "Minus" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "Equal" && input.shift && (input.control || input.meta))
            event.preventDefault();
        }
      }
    });
  },
  registerFramelessWindowIpc() {
    electron.ipcMain.on("win:invoke", (event, action) => {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (action === "show") {
          win.show();
        } else if (action === "showInactive") {
          win.showInactive();
        } else if (action === "min") {
          win.minimize();
        } else if (action === "max") {
          const isMaximized = win.isMaximized();
          if (isMaximized) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        } else if (action === "close") {
          win.close();
        }
      }
    });
  }
};
const profile = sqliteCore.sqliteTable("profile", {
  id: sqliteCore.integer("id").primaryKey(),
  name: sqliteCore.text("name").notNull(),
  address: sqliteCore.text("address").notNull(),
  phone: sqliteCore.text("phone"),
  email: sqliteCore.text("email"),
  gstNumber: sqliteCore.text("gst_number"),
  qstNumber: sqliteCore.text("qst_number"),
  defaultHourlyRate: sqliteCore.real("default_hourly_rate").notNull().default(23),
  invoiceStartNumber: sqliteCore.integer("invoice_start_number").notNull().default(1),
  invoiceNumberFormat: sqliteCore.text("invoice_number_format").notNull().default("YYYY-NNN"),
  dataRootPath: sqliteCore.text("data_root_path"),
  logoPath: sqliteCore.text("logo_path"),
  locale: sqliteCore.text("locale").notNull().default("fr-CA"),
  backupIntervalDays: sqliteCore.integer("backup_interval_days").notNull().default(7),
  backupRetentionCount: sqliteCore.integer("backup_retention_count").notNull().default(10),
  lateInvoiceAlertDays: sqliteCore.integer("late_invoice_alert_days").notNull().default(30),
  createdAt: sqliteCore.text("created_at").notNull(),
  updatedAt: sqliteCore.text("updated_at").notNull()
});
const clients = sqliteCore.sqliteTable("clients", {
  id: sqliteCore.integer("id").primaryKey({ autoIncrement: true }),
  name: sqliteCore.text("name").notNull(),
  companyName: sqliteCore.text("company_name"),
  address: sqliteCore.text("address").notNull(),
  phone: sqliteCore.text("phone"),
  email: sqliteCore.text("email"),
  primaryContact: sqliteCore.text("primary_contact"),
  billingType: sqliteCore.text("billing_type").notNull().default("hourly"),
  hourlyRate: sqliteCore.real("hourly_rate"),
  defaultHoursPerPeriod: sqliteCore.real("default_hours_per_period"),
  billingFrequency: sqliteCore.text("billing_frequency").notNull().default("biweekly"),
  active: sqliteCore.integer("active").notNull().default(1),
  notes: sqliteCore.text("notes"),
  createdAt: sqliteCore.text("created_at").notNull(),
  updatedAt: sqliteCore.text("updated_at").notNull()
});
const invoices = sqliteCore.sqliteTable("invoices", {
  id: sqliteCore.integer("id").primaryKey({ autoIncrement: true }),
  number: sqliteCore.text("number").notNull().unique(),
  clientId: sqliteCore.integer("client_id").notNull().references(() => clients.id),
  issueDate: sqliteCore.text("issue_date").notNull(),
  periodStart: sqliteCore.text("period_start").notNull(),
  periodEnd: sqliteCore.text("period_end").notNull(),
  hoursWeek1: sqliteCore.real("hours_week1").notNull(),
  hoursWeek2: sqliteCore.real("hours_week2").notNull(),
  totalHours: sqliteCore.real("total_hours").notNull(),
  hourlyRate: sqliteCore.real("hourly_rate").notNull(),
  subtotal: sqliteCore.real("subtotal").notNull(),
  gstRate: sqliteCore.real("gst_rate").notNull().default(0),
  qstRate: sqliteCore.real("qst_rate").notNull().default(0),
  gstAmount: sqliteCore.real("gst_amount").notNull().default(0),
  qstAmount: sqliteCore.real("qst_amount").notNull().default(0),
  total: sqliteCore.real("total").notNull(),
  description: sqliteCore.text("description").notNull(),
  additionalLines: sqliteCore.text("additional_lines"),
  status: sqliteCore.text("status").notNull().default("draft"),
  notes: sqliteCore.text("notes"),
  pdfPath: sqliteCore.text("pdf_path"),
  createdAt: sqliteCore.text("created_at").notNull(),
  updatedAt: sqliteCore.text("updated_at").notNull()
});
sqliteCore.sqliteTable("invoice_attachments", {
  id: sqliteCore.integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: sqliteCore.integer("invoice_id").notNull().references(() => invoices.id),
  name: sqliteCore.text("name").notNull(),
  path: sqliteCore.text("path").notNull(),
  type: sqliteCore.text("type").notNull(),
  createdAt: sqliteCore.text("created_at").notNull()
});
const payments = sqliteCore.sqliteTable("payments", {
  id: sqliteCore.integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: sqliteCore.integer("invoice_id").notNull().references(() => invoices.id),
  paymentDate: sqliteCore.text("payment_date").notNull(),
  amount: sqliteCore.real("amount").notNull(),
  paymentMethod: sqliteCore.text("payment_method").notNull(),
  reference: sqliteCore.text("reference"),
  notes: sqliteCore.text("notes"),
  proofPath: sqliteCore.text("proof_path"),
  createdAt: sqliteCore.text("created_at").notNull()
});
const expenses = sqliteCore.sqliteTable("expenses", {
  id: sqliteCore.integer("id").primaryKey({ autoIncrement: true }),
  date: sqliteCore.text("date").notNull(),
  amount: sqliteCore.real("amount").notNull(),
  description: sqliteCore.text("description").notNull(),
  category: sqliteCore.text("category").notNull(),
  deductibleRate: sqliteCore.real("deductible_rate").notNull().default(1),
  gstPaid: sqliteCore.real("gst_paid").notNull().default(0),
  qstPaid: sqliteCore.real("qst_paid").notNull().default(0),
  receiptPath: sqliteCore.text("receipt_path"),
  notes: sqliteCore.text("notes"),
  year: sqliteCore.integer("year").notNull(),
  createdAt: sqliteCore.text("created_at").notNull()
});
let dbInstance = null;
let rawDb = null;
function getDataRootPath() {
  const documentsPath = electron.app.getPath("documents");
  return path.join(documentsPath, "ArmyaFacturation");
}
function initDatabase() {
  const dataPath = getDataRootPath();
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
  const dbPath = path.join(dataPath, "armya.db");
  rawDb = new Database(dbPath);
  rawDb.pragma("journal_mode = WAL");
  rawDb.pragma("foreign_keys = ON");
  dbInstance = betterSqlite3.drizzle(rawDb);
  runMigrations(rawDb);
}
function getDb() {
  if (!dbInstance)
    throw new Error("Database not initialized");
  return dbInstance;
}
function runMigrations(db) {
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
    `);
}
function registerClientHandlers() {
  electron.ipcMain.handle("clients:getAll", () => {
    try {
      const db = getDb();
      const result = db.select().from(clients).all();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("clients:getOne", (_event, id) => {
    try {
      const db = getDb();
      const result = db.select().from(clients).where(drizzleOrm.eq(clients.id, id)).limit(1).all();
      return { success: true, data: result[0] ?? null };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("clients:create", (_event, data) => {
    try {
      const db = getDb();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const result = db.insert(clients).values({ ...data, createdAt: now, updatedAt: now }).returning().all();
      return { success: true, data: result[0] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("clients:update", (_event, id, data) => {
    try {
      const db = getDb();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const result = db.update(clients).set({ ...data, updatedAt: now }).where(drizzleOrm.eq(clients.id, id)).returning().all();
      return { success: true, data: result[0] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("clients:archive", (_event, id) => {
    try {
      const db = getDb();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      db.update(clients).set({ active: 0, updatedAt: now }).where(drizzleOrm.eq(clients.id, id)).run();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
function generateInvoiceNumber(format, startNumber, existingCount) {
  const year = (/* @__PURE__ */ new Date()).getFullYear().toString();
  const num = (startNumber + existingCount).toString().padStart(3, "0");
  return format.replace("YYYY", year).replace("NNN", num);
}
function registerInvoiceHandlers() {
  electron.ipcMain.handle("invoices:getAll", (_event, filters) => {
    try {
      const db = getDb();
      let query = db.select().from(invoices);
      const result = query.orderBy(drizzleOrm.desc(invoices.createdAt)).all();
      let filtered = result;
      if (filters?.clientId)
        filtered = filtered.filter((i) => i.clientId === filters.clientId);
      if (filters?.status)
        filtered = filtered.filter((i) => i.status === filters.status);
      if (filters?.year)
        filtered = filtered.filter((i) => i.issueDate.startsWith(String(filters.year)));
      return { success: true, data: filtered };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("invoices:getOne", (_event, id) => {
    try {
      const db = getDb();
      const result = db.select().from(invoices).where(drizzleOrm.eq(invoices.id, id)).limit(1).all();
      return { success: true, data: result[0] ?? null };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("invoices:nextNumber", () => {
    try {
      const db = getDb();
      const prof = db.select().from(profile).limit(1).all();
      const allInvoices = db.select().from(invoices).all();
      const format = prof[0]?.invoiceNumberFormat ?? "YYYY-NNN";
      const start = prof[0]?.invoiceStartNumber ?? 1;
      const number = generateInvoiceNumber(format, start, allInvoices.length);
      return { success: true, data: number };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("invoices:create", (_event, data) => {
    try {
      const db = getDb();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const result = db.insert(invoices).values({ ...data, createdAt: now, updatedAt: now }).returning().all();
      return { success: true, data: result[0] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("invoices:update", (_event, id, data) => {
    try {
      const db = getDb();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const result = db.update(invoices).set({ ...data, updatedAt: now }).where(drizzleOrm.eq(invoices.id, id)).returning().all();
      return { success: true, data: result[0] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("invoices:updateStatus", (_event, id, status) => {
    try {
      const db = getDb();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      db.update(invoices).set({ status, updatedAt: now }).where(drizzleOrm.eq(invoices.id, id)).run();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
function registerExpenseHandlers() {
  electron.ipcMain.handle("expenses:getAll", (_event, filters) => {
    try {
      const db = getDb();
      let result = db.select().from(expenses).all();
      if (filters?.year)
        result = result.filter((e) => e.year === filters.year);
      if (filters?.category)
        result = result.filter((e) => e.category === filters.category);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("expenses:create", (_event, data) => {
    try {
      const db = getDb();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const result = db.insert(expenses).values({ ...data, createdAt: now }).returning().all();
      return { success: true, data: result[0] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("expenses:update", (_event, id, data) => {
    try {
      const db = getDb();
      const result = db.update(expenses).set(data).where(drizzleOrm.eq(expenses.id, id)).returning().all();
      return { success: true, data: result[0] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("expenses:delete", (_event, id) => {
    try {
      const db = getDb();
      db.delete(expenses).where(drizzleOrm.eq(expenses.id, id)).run();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
function registerPaymentHandlers() {
  electron.ipcMain.handle("payments:getForInvoice", (_event, invoiceId) => {
    try {
      const db = getDb();
      const result = db.select().from(payments).where(drizzleOrm.eq(payments.invoiceId, invoiceId)).all();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("payments:create", (_event, data) => {
    try {
      const db = getDb();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const result = db.insert(payments).values({ ...data, createdAt: now }).returning().all();
      return { success: true, data: result[0] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
function formatDate(dateStr, locale) {
  const date = new Date(dateStr);
  if (locale === "fr-CA") {
    return date.toLocaleDateString("fr-CA");
  }
  return date.toLocaleDateString("en-CA");
}
function formatCurrency(amount, locale) {
  if (locale === "fr-CA") {
    return `${amount.toFixed(2).replace(".", ",")} $`;
  }
  return `$${amount.toFixed(2)}`;
}
function registerPdfHandlers() {
  electron.ipcMain.handle("pdf:generateInvoice", async (_event, invoiceId) => {
    try {
      const db = getDb();
      const invoice = db.select().from(invoices).where(drizzleOrm.eq(invoices.id, invoiceId)).limit(1).all()[0];
      if (!invoice)
        return { success: false, error: "Invoice not found" };
      const client = db.select().from(clients).where(drizzleOrm.eq(clients.id, invoice.clientId)).limit(1).all()[0];
      const prof = db.select().from(profile).limit(1).all()[0];
      if (!client || !prof)
        return { success: false, error: "Missing client or profile" };
      const locale = prof.locale ?? "fr-CA";
      const templatePath = path.join(__dirname, "../../../templates/invoice-default.html");
      let html = fs.readFileSync(templatePath, "utf-8");
      const logoUrl = prof.logoPath ? `file://${prof.logoPath}` : "";
      const replacements = {
        "{{name}}": prof.name,
        "{{address}}": prof.address.replace(/\n/g, "<br>"),
        "{{clientName}}": client.companyName ?? client.name,
        "{{clientAddress}}": client.address.replace(/\n/g, "<br>"),
        "{{number}}": invoice.number,
        "{{date}}": formatDate(invoice.issueDate, locale),
        "{{periodStart}}": formatDate(invoice.periodStart, locale),
        "{{periodEnd}}": formatDate(invoice.periodEnd, locale),
        "{{hoursWeek1}}": invoice.hoursWeek1.toString(),
        "{{hoursWeek2}}": invoice.hoursWeek2.toString(),
        "{{totalHours}}": invoice.totalHours.toString(),
        "{{hourlyRate}}": formatCurrency(invoice.hourlyRate, locale),
        "{{description}}": invoice.description,
        "{{subtotal}}": formatCurrency(invoice.subtotal, locale),
        "{{gst}}": formatCurrency(invoice.gstAmount, locale),
        "{{qst}}": formatCurrency(invoice.qstAmount, locale),
        "{{total}}": formatCurrency(invoice.total, locale),
        "{{logoUrl}}": logoUrl
      };
      for (const [key, value] of Object.entries(replacements)) {
        html = html.replaceAll(key, value);
      }
      const outputDir = path.join(getDataRootPath(), "attachments", "invoices", String(invoiceId));
      if (!fs.existsSync(outputDir))
        fs.mkdirSync(outputDir, { recursive: true });
      const pdfPath = path.join(outputDir, `invoice-${invoice.number}.pdf`);
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
      await browser.close();
      db.update(invoices).set({ pdfPath, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(drizzleOrm.eq(invoices.id, invoiceId)).run();
      return { success: true, data: pdfPath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
function getBackupsDir() {
  return path.join(getDataRootPath(), "backups");
}
function getDbPath() {
  return path.join(getDataRootPath(), "armya.db");
}
function getAttachmentsPath() {
  return path.join(getDataRootPath(), "attachments");
}
function computeChecksum(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}
function registerBackupHandlers() {
  electron.ipcMain.handle("backup:create", () => {
    try {
      const backupsDir = getBackupsDir();
      if (!fs.existsSync(backupsDir))
        fs.mkdirSync(backupsDir, { recursive: true });
      const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const zipPath = path.join(backupsDir, `armya-backup-${date}.zip`);
      const zip = new AdmZip();
      const dbPath = getDbPath();
      if (fs.existsSync(dbPath))
        zip.addLocalFile(dbPath);
      const attachmentsPath = getAttachmentsPath();
      if (fs.existsSync(attachmentsPath))
        zip.addLocalFolder(attachmentsPath, "attachments");
      const manifest = {
        appVersion: "0.1.0",
        date: (/* @__PURE__ */ new Date()).toISOString(),
        schemaVersion: 1,
        checksum: fs.existsSync(dbPath) ? computeChecksum(dbPath) : ""
      };
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));
      zip.writeZip(zipPath);
      pruneOldBackups(backupsDir, 10);
      return { success: true, data: zipPath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("backup:list", () => {
    try {
      const backupsDir = getBackupsDir();
      if (!fs.existsSync(backupsDir))
        return { success: true, data: [] };
      const files = fs.readdirSync(backupsDir).filter((f) => f.endsWith(".zip")).map((f) => ({
        name: f,
        path: path.join(backupsDir, f),
        date: fs.statSync(path.join(backupsDir, f)).mtime
      })).sort((a, b) => b.date.getTime() - a.date.getTime());
      return { success: true, data: files };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("backup:restore", (_event, zipPath) => {
    try {
      if (!fs.existsSync(zipPath))
        return { success: false, error: "Backup file not found" };
      const zip = new AdmZip(zipPath);
      const manifestEntry = zip.getEntry("manifest.json");
      if (!manifestEntry)
        return { success: false, error: "Invalid backup: missing manifest" };
      const manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
      if (!manifest.schemaVersion)
        return { success: false, error: "Invalid manifest format" };
      zip.extractAllTo(getDataRootPath(), true);
      return { success: true, data: manifest };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
function pruneOldBackups(dir, keep) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".zip")).map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtime.getTime() })).sort((a, b) => b.mtime - a.mtime);
  files.slice(keep).forEach((f) => fs.unlinkSync(path.join(dir, f.name)));
}
function registerProfileHandlers() {
  electron.ipcMain.handle("profile:get", () => {
    try {
      const db = getDb();
      const result = db.select().from(profile).limit(1).all();
      return { success: true, data: result[0] ?? null };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("profile:save", (_event, data) => {
    try {
      const db = getDb();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const existing = db.select().from(profile).limit(1).all();
      if (existing.length === 0) {
        db.insert(profile).values({ ...data, id: 1, createdAt: now, updatedAt: now }).run();
      } else {
        db.update(profile).set({ ...data, updatedAt: now }).where(drizzleOrm.eq(profile.id, 1)).run();
      }
      const updated = db.select().from(profile).limit(1).all();
      return { success: true, data: updated[0] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("config:get", () => {
    try {
      const db = getDb();
      const result = db.select().from(profile).limit(1).all();
      return { success: true, data: result[0] ?? null };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("config:isFirstLaunch", () => {
    try {
      const db = getDb();
      const result = db.select().from(profile).limit(1).all();
      return { success: true, data: result.length === 0 };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("dialog:openFile", (_event, options) => {
    try {
      const result = electron.dialog.showOpenDialogSync(options);
      return { success: true, data: result ?? null };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("dialog:saveFile", (_event, options) => {
    try {
      const result = electron.dialog.showSaveDialogSync(options);
      return { success: true, data: result ?? null };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.armya.facturation");
  electron.app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  initDatabase();
  registerProfileHandlers();
  registerClientHandlers();
  registerInvoiceHandlers();
  registerExpenseHandlers();
  registerPaymentHandlers();
  registerPdfHandlers();
  registerBackupHandlers();
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0)
      createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
