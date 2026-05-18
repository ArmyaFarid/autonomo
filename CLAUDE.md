# CLAUDE.md — Autonomo

> Read this file in full at the start of every session. Never deviate from the technical and business decisions documented here without explicit user validation. Check PROGRESS.md to know exactly where development left off.

---

## Context

**User:** A software developer working as a freelancer (travailleur autonome) in Quebec, an international student.

**What this app does:** The user issues invoices to their clients (companies or individuals) for their software development services (development, prototyping, AI research, startup tech consulting). They need a local desktop app to manage clients, issue invoices compliant with Quebec regulations, track business expenses, and prepare their annual tax return.

**Critical constraint — international student status:**
Hours worked AND the work period are **mandatory on every invoice without exception**. These two fields can never be removed, hidden, or made optional. They serve as compliance proof for the Canadian study permit.

**Quebec compliance:**
All invoices must meet Revenu Québec requirements: issuer name and address, client name and address, sequential invoice number, date, service description, quantity (hours), unit price (hourly rate), total amount. Taxes (GST/QST) disabled by default (income under $30,000/year) but can be enabled per invoice.

---

## Session Rules

**At the start of every session:**
1. Read this file in full
2. Read PROGRESS.md to know where development left off
3. Read MISTAKES.md to avoid repeating past errors
4. Continue from exactly where we stopped — never restart or refactor what is already working

**At the end of every session or after any significant change:**
1. Update PROGRESS.md — mark completed tasks, update in-progress, add notes for next session
2. If a mistake was made and corrected during this session, append it to MISTAKES.md immediately
3. If a new technical decision was made, document it in the relevant section of this file

---

## Language Rules

**Code language: English** — all variable names, function names, file names, and code comments must be in English.

**UI language: French by default** — all text displayed to the user is in French (fr-CA) by default. English (en-CA) is available as an option in Settings.

**i18n stack: i18next + react-i18next**
- Default locale: `fr-CA`
- Fallback locale: `en-CA`
- Selected locale stored in `config.json`
- **Never hardcode display strings** — every UI string must go through i18n keys
- Locale files: `src/locales/fr/translation.json` and `src/locales/en/translation.json`

**Date format:**
- `fr-CA`: `JJ/MM/AAAA`
- `en-CA`: `MM/DD/YYYY`

**Currency format:**
- `fr-CA`: `218,50 $`
- `en-CA`: `$218.50`

---

## Tech Stack — Final Decisions

```
Electron + Vite + React + TypeScript
  ├── shadcn/ui + Tailwind CSS         (UI components)
  ├── Jotai                             (global state)
  ├── Drizzle ORM + better-sqlite3      (local database)
  ├── Puppeteer                         (PDF generation from HTML/CSS)
  ├── i18next + react-i18next           (internationalization)
  ├── adm-zip                           (backup/restore as .zip)
  └── Electron FS API                   (attachments management)
```

**Why these choices:**
- Electron over Tauri: the developer already masters the JS/TS stack and develops with Claude Code — 100% TypeScript, no Rust
- Jotai over Zustand: explicit user preference
- Puppeteer over @react-pdf/renderer: invoice templates in plain HTML/CSS, editable directly in VS Code
- better-sqlite3 for synchronous performance in Electron
- Drizzle ORM for native TypeScript typing and clean migrations

---

## Library Stability Rules

**Always prioritize stability over latest releases:**
- Use the latest **stable/LTS** version of every library — never use beta, rc, alpha, canary, or next versions
- Before installing any dependency, verify it is actively maintained and compatible with the current Electron version
- When multiple versions could work, always pick the one with the longest track record in Electron projects
- Never upgrade a working dependency mid-feature — only upgrade between phases and only if there is a strong reason
- If a library has known Electron compatibility issues, document it in MISTAKES.md and find an alternative

**Version pinning:**
- Pin all dependency versions in `package.json` (no `^` or `~` prefixes) — exact versions only
- This ensures the app builds identically every time and on every machine

---

## Electron Security Rules (override react.md if conflict)

A global React rules file exists at `~/.claude/rules/react.md`. Follow it, **but Electron best practices take priority in case of conflict**, specifically:
- IPC security: always use `contextBridge` and `ipcRenderer` via preload script — never expose Node.js directly to the renderer
- Strict separation of main process / renderer process
- File system access only via IPC from the main process
- `nodeIntegration: false` and `contextIsolation: true` mandatory in all BrowserWindow instances
- Never use `remote` module

---

## Coding Conventions

- **TypeScript strict mode** — `strict: true` in tsconfig, no `any`
- **Naming** — camelCase for variables/functions, PascalCase for components and types
- **Components** — one component per file, named exports
- **Jotai atoms** — in `src/store/`, one file per domain (clientsAtom, invoicesAtom, etc.)
- **IPC handlers** — in `electron/ipc/`, one file per module
- **IPC response shape** — always return `{ success: boolean, data?: T, error?: string }`
- **Error handling** — always wrap IPC handlers in try/catch, never let errors crash the main process
- **Dates** — always store as ISO 8601 string in SQLite (`YYYY-MM-DD`)
- **Amounts** — always store as `real` (float) in SQLite, display with 2 decimals in locale format
- **No hardcoded display strings** — always use i18n keys

---

## Folder Structure

```
autonomo/
  ├── CLAUDE.md                         (this file)
  ├── PROGRESS.md                       (progress tracker — updated every session)
  ├── MISTAKES.md                       (mistakes log — never repeat)
  ├── electron/
  │     ├── main.ts                     (Electron main process)
  │     ├── preload.ts                  (contextBridge IPC)
  │     └── ipc/                        (IPC handlers per module)
  │           ├── clients.ts
  │           ├── invoices.ts
  │           ├── expenses.ts
  │           ├── payments.ts
  │           ├── backup.ts
  │           └── pdf.ts
  ├── src/
  │     ├── main.tsx
  │     ├── app.tsx
  │     ├── components/
  │     │     ├── ui/                   (shadcn components)
  │     │     └── shared/              (shared components)
  │     ├── pages/
  │     │     ├── dashboard/
  │     │     ├── clients/
  │     │     ├── invoices/
  │     │     ├── expenses/
  │     │     ├── reports/
  │     │     └── settings/
  │     ├── store/                      (Jotai atoms)
  │     ├── hooks/
  │     ├── types/
  │     ├── lib/
  │     └── locales/
  │           ├── fr/
  │           │     └── translation.json
  │           └── en/
  │                 └── translation.json
  ├── db/
  │     ├── schema.ts
  │     └── migrations/
  └── templates/
        ├── invoice-default.html        (invoice HTML template)
        └── invoice-default.css
```

**User data folder (runtime):**
```
~/Documents/Autonomo/          (configurable in Settings)
  ├── autonomo.db
  ├── config.json
  ├── attachments/
  │     ├── invoices/
  │     │     └── {invoice_id}/
  │     └── expenses/
  │           └── {expense_id}/
  └── backups/
        └── autonomo-backup-YYYY-MM-DD.zip
```

---

## Database Schema

```typescript
// db/schema.ts

export const profile = sqliteTable('profile', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  phone: text('phone'),
  email: text('email'),
  gstNumber: text('gst_number'),
  qstNumber: text('qst_number'),
  defaultHourlyRate: real('default_hourly_rate').notNull().default(23),
  invoiceStartNumber: integer('invoice_start_number').notNull().default(1),
  invoiceNumberFormat: text('invoice_number_format').notNull().default('YYYY-NNN'),
  dataRootPath: text('data_root_path'),
  logoPath: text('logo_path'),
  locale: text('locale').notNull().default('fr-CA'),
  backupIntervalDays: integer('backup_interval_days').notNull().default(7),
  backupRetentionCount: integer('backup_retention_count').notNull().default(10),
  lateInvoiceAlertDays: integer('late_invoice_alert_days').notNull().default(30),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const clients = sqliteTable('clients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  companyName: text('company_name'),
  address: text('address').notNull(),
  phone: text('phone'),
  email: text('email'),
  primaryContact: text('primary_contact'),
  billingType: text('billing_type').notNull().default('hourly'), // 'hourly' | 'fixed'
  hourlyRate: real('hourly_rate'),
  defaultHoursPerPeriod: real('default_hours_per_period'),
  billingFrequency: text('billing_frequency').notNull().default('biweekly'), // 'biweekly' | 'monthly' | 'one-time'
  active: integer('active').notNull().default(1),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const invoices = sqliteTable('invoices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  number: text('number').notNull().unique(),
  clientId: integer('client_id').notNull().references(() => clients.id),
  issueDate: text('issue_date').notNull(),
  periodStart: text('period_start').notNull(),        // MANDATORY — never remove
  periodEnd: text('period_end').notNull(),            // MANDATORY — never remove
  hoursWeek1: real('hours_week1').notNull(),          // MANDATORY — never remove
  hoursWeek2: real('hours_week2').notNull(),          // MANDATORY — never remove
  totalHours: real('total_hours').notNull(),          // MANDATORY — calculated
  hourlyRate: real('hourly_rate').notNull(),
  subtotal: real('subtotal').notNull(),
  gstRate: real('gst_rate').notNull().default(0),
  qstRate: real('qst_rate').notNull().default(0),
  gstAmount: real('gst_amount').notNull().default(0),
  qstAmount: real('qst_amount').notNull().default(0),
  total: real('total').notNull(),
  description: text('description').notNull(),
  additionalLines: text('additional_lines'),          // JSON for special invoices
  status: text('status').notNull().default('draft'),  // 'draft'|'sent'|'paid'|'overdue'
  notes: text('notes'),
  pdfPath: text('pdf_path'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const invoiceAttachments = sqliteTable('invoice_attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id),
  name: text('name').notNull(),
  path: text('path').notNull(),
  type: text('type').notNull(), // 'hours_proof'
  createdAt: text('created_at').notNull(),
})

export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id),
  paymentDate: text('payment_date').notNull(),
  amount: real('amount').notNull(),
  paymentMethod: text('payment_method').notNull(), // 'wire'|'cheque'|'interac'|'other'
  reference: text('reference'),
  notes: text('notes'),
  proofPath: text('proof_path'),
  createdAt: text('created_at').notNull(),
})

export const expenses = sqliteTable('expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  amount: real('amount').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  // Categories:
  // 'office_supplies' | 'telecom' | 'transport' | 'training'
  // 'equipment' | 'business_meals' | 'home_office' | 'software'
  // 'hosting' | 'domains' | 'api_credits' | 'other'
  deductibleRate: real('deductible_rate').notNull().default(1), // 1 = 100%, 0.5 = 50% (meals)
  gstPaid: real('gst_paid').notNull().default(0),
  qstPaid: real('qst_paid').notNull().default(0),
  receiptPath: text('receipt_path'),
  notes: text('notes'),
  year: integer('year').notNull(),
  createdAt: text('created_at').notNull(),
})
```

---

## Modules & Features

### Module 0 — First Launch
- Welcome screen: "New installation" or "Restore from backup"
- New installation → profile setup wizard (name, address, hourly rate, locale)
- Restore → select `.zip` file, validate manifest, extract and migrate if needed

### Module 1 — Settings / Profile
- Edit personal information
- Configure data root path (default: `~/Documents/Autonomo/`)
- Upload logo (optional)
- Configure invoice number format
- Configure late invoice alert threshold (default: 30 days)
- Configure backup interval (default: 7 days) and retention count
- Language toggle: French / English
- Open templates folder in Finder

### Module 2 — Clients
- Client list with active/archived status
- Create / edit / archive a client
- Fields: name, company, address, phone, email, primary contact
- Billing type: hourly (rate + default hours) or fixed
- Frequency: biweekly, monthly, one-time
- Free notes

### Module 3 — Invoices

**Creating an invoice:**
1. Select client
2. Period auto-suggested based on client billing frequency
3. Week 1 and Week 2 hours pre-filled with client default — editable
4. Total hours calculated automatically
5. Hourly rate pre-filled — editable
6. Amount calculated automatically
7. Description with selectable predefined suggestions (combinable)
8. Option to add extra lines (special invoice)
9. Attach proof of hours (PDF, image, Excel)
10. Save as draft or issue directly

**Predefined service descriptions (selectable and combinable):**
- Feature development
- Interface prototyping / proof of concept
- AI research and integration
- Technical architecture and system design
- Code review and debugging
- Technical meetings and project follow-up
- Technical documentation
- Infrastructure deployment and configuration

**Invoice statuses:**
- `draft` → being prepared, not yet sent
- `sent` → PDF generated and sent to client
- `paid` → payment received and recorded
- `overdue` → sent more than X days ago with no payment (auto-calculated)

**PDF generation:**
- Puppeteer injects data into `templates/invoice-default.html`
- Available template variables: `{{name}}`, `{{address}}`, `{{clientName}}`, `{{clientAddress}}`, `{{number}}`, `{{date}}`, `{{periodStart}}`, `{{periodEnd}}`, `{{hoursWeek1}}`, `{{hoursWeek2}}`, `{{totalHours}}`, `{{hourlyRate}}`, `{{description}}`, `{{subtotal}}`, `{{gst}}`, `{{qst}}`, `{{total}}`, `{{logoUrl}}`
- PDF saved to `attachments/invoices/{invoice_id}/`
- **Always present on PDF:** period start, period end, week 1 hours, week 2 hours, total hours, hourly rate

### Module 4 — Payments
- Record a payment on a sent invoice
- Full or partial payment (multiple installments supported)
- Methods: wire transfer, cheque, Interac, other
- Transaction reference (optional)
- Attach payment proof (screenshot, bank statement)
- Remaining balance auto-calculated for partial payments

### Module 5 — Expenses
- Add expense with date, amount, description, category
- Categories adapted to software developer freelancer profile
- Business meals: 50% deductible automatically
- GST/QST paid recordable (for future recovery if registered)
- Attach receipt photo
- Filterable by year, category, month

### Module 6 — Reports

**Dashboard:**
- Current month revenue
- Invoices awaiting payment (with amounts)
- Overdue invoices (visual alert)
- Current month expenses
- Estimated net income (revenue − deductible expenses)

**Annual tax report:**
- Total gross revenue by year
- Total expenses by category with deductible amounts
- Estimated net taxable income
- GST/QST summary if applicable
- PDF and CSV export

**Invoice history:**
- Filterable by client, period, status, year
- Direct access to each invoice PDF

### Module 7 — Backup / Restore

**Auto-backup on app launch:**
- Check if last backup is older than X days (configurable, default 7)
- If yes → create zip silently in background
- Show discreet toast notification: translated via i18n key
- Configurable retention (default: keep last 10 backups)
- No cloud — local only

**Zip structure:**
```
autonomo-backup-YYYY-MM-DD.zip
  ├── autonomo.db
  ├── attachments/
  └── manifest.json  → { appVersion, date, checksum, schemaVersion }
```

**Restore:**
- Accessible from Settings → "Restore a backup"
- Select a `.zip` file
- Validate manifest (version, checksum)
- Auto schema migration if version differs
- Confirmation dialog before overwriting existing data

---

## Business Rules — Never Break These

1. **Hours worked = mandatory on every invoice** — not optional, not hideable
2. **Period (start + end) = mandatory on every invoice** — not optional, not hideable
3. **Sequential invoice numbering** — never reuse a number, never skip one
4. **A sent invoice cannot be deleted** — only archived (accounting integrity)
5. **Taxes at 0% by default** — only enabled manually per invoice
6. **Local backup only** — no data ever leaves the user's Mac
7. **French is the default locale** — fr-CA, never assume English

---

## Roadmap

### Phase 1 — Foundation
- [ ] Project init: Electron + Vite + React + TypeScript
- [ ] Tailwind + shadcn/ui setup
- [ ] Drizzle + better-sqlite3 + initial schema
- [ ] IPC architecture (main, preload, handlers)
- [ ] i18next setup with fr-CA default and en-CA fallback
- [ ] Main navigation (sidebar)
- [ ] First launch screen (new install / restore)

### Phase 2 — Profile + Clients
- [ ] Settings / Profile module
- [ ] Clients module (full CRUD)

### Phase 3 — Invoices core
- [ ] Invoice creation (Type A — standard hourly)
- [ ] PDF generation with Puppeteer + HTML/CSS template
- [ ] `invoice-default.html` template — Quebec compliant
- [ ] Status management
- [ ] Hours proof attachments

### Phase 4 — Advanced Invoices + Payments
- [ ] Special invoice (Type B — multiple lines)
- [ ] Payments module (full + partial + proof)
- [ ] Overdue invoice alerts

### Phase 5 — Expenses
- [ ] Expenses module (CRUD + categories + receipts)

### Phase 6 — Reports + Backup
- [ ] Dashboard
- [ ] Annual tax report + exports
- [ ] Auto-backup / restore system
- [ ] First launch restore flow

---

## Out of Scope — Do Not Implement

- Automatic email sending
- Cloud sync
- Multi-user
- Advanced accounting
- Mobile app
