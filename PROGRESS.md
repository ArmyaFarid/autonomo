# PROGRESS.md — ArmyaFacturation

> Updated by Claude Code at the end of every session. Reflects the exact state of the project at all times. Always read this before starting any work.

---

## Overall Status: 🟡 Invoice lifecycle + cash-basis revenue done — testing next

**Last updated:** 2026-04-30
**Last session summary:** Complete invoice lifecycle refactor (Phase 1 status system). ComputedPaymentStatus (draft/unpaid/partial/paid/credited/voided) computed from totalPaid+totalCredit, never stored. Document status (draft/issued/voided) = legal lifecycle. Fixed CancelWizard UX (each option does one thing on click, void goes straight to ConfirmModal). Rewrote revenue calculation across dashboard + reports to cash-basis (actual payments received, not invoice face value). New payments:getByYear IPC with JOIN. PaymentReport type added. TypeScript clean.

---

## Phase 1 — Foundation ✅

- [x] Project init: Electron + Vite + React + TypeScript
- [x] Tailwind + shadcn CSS variables setup
- [x] Drizzle + better-sqlite3 + initial schema (inline SQL migrations, no drizzle-kit needed for now)
- [x] IPC architecture (main, preload via contextBridge, handlers per module)
- [x] i18next setup (fr-CA default, en-CA fallback, all UI strings in translation.json)
- [x] Main navigation (sidebar with 6 sections)
- [x] First launch screen (new install → profile wizard, restore → zip picker)

**What exists and works:**
- `electron/main.ts` — Electron main process, registers all IPC handlers, calls `initDatabase()`
- `electron/preload.ts` — contextBridge exposes typed `window.api`
- `electron/ipc/` — profile, clients, invoices, expenses, payments, pdf, backup handlers
- `db/schema.ts` — Drizzle schema + inline SQLite migration (CREATE TABLE IF NOT EXISTS for all tables)
- `src/app.tsx` — checks first launch, renders FirstLaunchPage or MainLayout
- `src/pages/first-launch/first-launch-page.tsx` — choice screen + profile setup form (react-hook-form + zod)
- `src/components/shared/main-layout.tsx` — sidebar nav + page router
- `src/pages/*/` — stub pages for all 6 sections (dashboard, clients, invoices, expenses, reports, settings)
- `src/locales/fr/translation.json` + `src/locales/en/translation.json` — complete initial key set
- `src/lib/i18n.ts` — i18next init
- `src/lib/utils.ts` — cn(), formatCurrency(), formatDate(), toIsoDate()
- `src/types/definitions.ts` — Profile, Client, Invoice, Payment, Expense types
- `src/store/` — profileAtom, clientsAtom, invoicesAtom (Jotai)
- `templates/invoice-default.html` + `templates/invoice-default.css` — Quebec-compliant invoice template
- Build: `npm run build` → clean output in `out/`

**Config decisions made:**
- `skipLibCheck: true` in tsconfig.node.json — drizzle-orm ships with internal mysql2/bun-types references that break strict tsc
- puppeteer pinned to 24.42.0 (22.x was deprecated)
- electron-vite config requires explicit `build.rollupOptions.input` for all 3 targets (main, preload, renderer)
- renderer root set to `src/` → index.html script tag uses `./main.tsx` (relative), not `/src/main.tsx`

---

## Phase 2 — Profile + Clients ✅

- [x] Settings / Profile module (full edit form)
- [x] Clients list (table with active/archived toggle)
- [x] Client creation form (modal)
- [x] Client editing form (modal)
- [x] Client archiving (confirm dialog)

## Phase 3 — Invoices core ✅

- [x] Invoice list (status badges, filters by status/year/client)
- [x] Invoice creation form (client picker, period auto-suggest, hours week1+week2, rate, service multi-select, GST/QST toggle, save draft or issue)
- [x] PDF generation (Puppeteer → templates/invoice-default.html)
- [x] Status transitions: draft → sent → paid (confirm dialogs)
- [x] Hours proof attachment (file picker → attachments/invoices/{id}/)

## Phase 4 — Expenses ✅

- [x] Expense entry (date, amount, description, category)
- [x] 12 categories + auto 50% deductible for business_meals
- [x] GST/QST paid fields
- [x] Receipt attachment (file picker → attachments/expenses/{id}/)
- [x] Filters: by year, category, month
- [x] Expense list with totals (total + deductible summary bar)

## Phase 5 — Reports + Backup 🟡

- [x] Dashboard (monthly cards + annual summary with tax reserve + spendable income)
- [x] Annual tax report (revenue + expenses by category + deductible amounts + GST/QST summary)
- [x] PDF + CSV export
- [ ] Restore from zip (Settings → validate manifest → migrate if needed)
- [ ] Auto-backup on launch ← DERNIÈRE PRIORITÉ

## Phase 5.5 — Invoice lifecycle refactor ✅ (done 2026-04-30)

**Status system:**
- `ComputedPaymentStatus`: `draft | unpaid | partial | paid | credited | voided` — computed from `totalPaid + totalCredit`, never stored in DB
- Document status (DB): `draft | issued | voided` — legal lifecycle only
- `computePaymentStatus()` lives in `src/types/definitions.ts`, used everywhere

**Business rules enforced:**
- `canVoid = docStatus === "issued" && payStatus === "unpaid"` (no cash moved at all)
- `canCredit = docStatus === "issued" && (payStatus === "unpaid" || payStatus === "partial")`
- `canRecordPayment = docStatus === "issued" && payStatus !== "paid" && payStatus !== "credited"`
- Voided is terminal — no reopen
- Credit note pre-fills with `balanceDue` (not invoice total)

**CancelWizard UX:**
- VOID card: single click → closes wizard → opens ConfirmModal (same pattern as Issue)
- CREDIT card: single click → navigates to credit form
- Back button shows "Back" only if canVoid (otherwise "Cancel")

**Cash-basis revenue:**
- New `payments:getByYear` IPC — raw SQL JOIN of payments + invoices, filters voided invoices
- New `PaymentReport` type: payment row joined with invoice context
- Dashboard + reports both use actual cash received (not invoice face value)
- Revenue grouped by invoice in reports: `byInvoice` Map with `received` field
- Monthly revenue filtered by `paymentDate` month (not issue date)

**Files changed:** invoice-detail-modal.tsx, payment-form-modal.tsx, create-invoice-form.tsx, import-invoice-form.tsx, invoices-list.tsx, dashboard-page.tsx, reports-page.tsx, definitions.ts, payments.ts (ipc), invoices.ts (ipc), reports.ts (ipc), preload.ts, translation.json (fr+en)

## Phase 5.6 — Bug fixes ⬜  ← NEXT

- [ ] Full end-to-end smoke test after lifecycle refactor
- [ ] Old invoices/expenses: pdfPath/receiptPath point to old folder structure — opening those files will fail (paths changed in a prior session)

## Phase 6 — Payments ✅

- [x] Full payment recording
- [x] Partial payment recording + remaining balance
- [x] Payment methods: wire, cheque, Interac, other
- [x] Payment proof attachment
- [x] Auto-mark invoice as paid when totalPaid >= total
- [x] Optional dueDate on invoice (auto-suggest +30 days, clearable)

## Phase 7 — File naming + attachments + import ✅ (done 2026-04-25)

**File naming scheme (electron/ipc/utils.ts):**
- `buildSlug(name)` — lowercase, remove accents, spaces→hyphens
- `resolveDestPath(dir, name)` — collision-safe (appends _2, _3...)
- Invoice PDF: `attachments/invoices/{year}/invoice_{user}_{number}_{client}_{date}.pdf`
- Hours proof: `hours-proof_{user}_{number}_{client}_{originalName}`
- Payment proof: `payment-proof_{user}_{number}_{client}_{originalName}`
- Expense receipt: `attachments/expenses/{year}/receipt_{user}_id{id}_{date}_{category}_{originalName}`
- Imported PDF: same convention as generated PDF

**Attachment management:**
- Invoice detail modal: Attachments section (list, open, delete per file), attach button moved there
- Expense form: receipt shows filename + open + delete (not just "attached" text)
- New IPC: `invoices:deleteAttachment`, `expenses:deleteReceipt`, `invoices:attachImportedPdf`

**Import invoice (`import-invoice-form.tsx`):**
- invoiceType: "imported" — manual number, direct subtotal, single totalHours, GST/QST toggles, status picker (paid/sent/draft), optional PDF attach
- Amber "Importée" badge in list + detail modal header
- Generate PDF + Edit buttons hidden for imported invoices
- Fix: subtotal `watch()` crash — `parseFloat(String(...)) || 0` guard

## Phase 8 — Backup ⬜  (lowest priority)

- [ ] Auto-backup on launch (check interval, create zip silently)
- [ ] Restore from zip (Settings → validate manifest → migrate)

---

## Feature Backlog — Pro Polish (identified 2026-04-30)

Grouped by priority. Pick up from here next session.

### 🔴 Priority 1 — Quebec compliance

- [ ] **$30,000 GST/QST threshold alert** — when YTD revenue approaches $30K, show a persistent warning banner in the dashboard telling the user to register for GST/QST. Missing this is a real compliance risk.
- [ ] **Acomptes provisionnels estimate** — Quebec requires quarterly tax installments once owed taxes exceed ~$1,800/year. Dashboard section showing estimated Q1/Q2/Q3/Q4 amounts based on current YTD income and tax reserve rate.

### 🟠 Priority 2 — High-value professional documents

- [ ] **Invoice duplication** — "Dupliquer" button on any invoice that pre-fills a new invoice form with same client, rate, hours, description. Armya bills biweekly — this would be used every two weeks.
- [ ] **Client statement PDF** — one document per client showing all invoices, payments, credits and current balance. Useful when a client disputes their account. New IPC `clients:generateStatement`, new PDF template.

### 🟡 Priority 3 — Visibility and reporting

- [ ] **Aging report** — invoices grouped by 0–30, 31–60, 61–90, 90+ days outstanding. A table in the Reports page, exportable. More useful than the current simple overdue flag.
- [ ] **Revenue by client** — breakdown in the annual report and dashboard showing which client generated how much revenue this year.
- [ ] **Global search** — search across invoices (number, client, description), expenses (description, category), clients (name, company). A search bar in the sidebar or top bar.

### 🟢 Priority 4 — Convenience

- [ ] **Recurring expenses** — mark an expense as recurring (monthly/annual) so it auto-creates next occurrence. Useful for hosting, domains, SaaS subscriptions.
- [ ] **Overpayment detection** — if a payment would cause totalPaid > total, warn the user and show the overpaid amount clearly in the balance summary.

---

## Technical Decisions Made During Development

- **No drizzle-kit migrations** — using inline `runMigrations()` with `CREATE TABLE IF NOT EXISTS` in `db/schema.ts`. Simple and reliable for a single-user local app.
- **skipLibCheck: true** in tsconfig.node.json — drizzle-orm's own `.d.ts` files reference mysql2 and bun-types which aren't installed. This is a known upstream issue.
- **Puppeteer 24.42.0** — 22.x was deprecated at install time, upgraded immediately.
- **electron-vite entry points** — must be explicit in `build.rollupOptions.input` for main, preload, and renderer. The renderer root is `src/`, so HTML scripts use relative paths.

---

## Notes for Next Session

Phase 5.5 — Bug fixes:
- Let user test the full app and report bugs
- Fix all reported issues before moving to Payments

Then Phase 6 — Payments:
- Record full or partial payment on a sent invoice
- Methods: wire, cheque, Interac, other
- Attach payment proof

Auto-backup — last priority:

1. Dashboard: monthly revenue (paid invoices), pending invoices count + amount, overdue alerts, monthly expenses, estimated net income
2. Annual tax report: revenue + expenses by category + deductible totals + GST/QST summary
3. PDF + CSV export for tax report
4. Auto-backup on launch (check last backup date vs. configured interval, create zip silently)
5. Restore from zip (Settings → validate manifest → migrate if needed)
