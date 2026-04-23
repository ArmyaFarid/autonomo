# PROGRESS.md — ArmyaFacturation

> Updated by Claude Code at the end of every session. Reflects the exact state of the project at all times. Always read this before starting any work.

---

## Overall Status: 🟡 Phase 3 complete — Phase 4 (Payments) next

**Last updated:** 2026-04-22
**Last session summary:** Invoice PDF template completely redesigned to match user's reference invoice. New template: top-right issuer block, 4-column meta bar with large total amount, teal accent (#5a8fa5), week1+week2 as separate line items with date ranges, single "Taxe" line always shown (0,00 when no taxes). Updated pdf.ts to generate {{logoBlock}}, {{issuerBlock}}, {{lineItems}}, {{totalsRows}} HTML blocks dynamically.

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

## Phase 4 — Advanced Invoices + Payments ⬜

- [ ] Special invoice — Type B (multiple lines)
- [ ] Full payment recording
- [ ] Partial payment recording
- [ ] Payment proof attachment
- [ ] Overdue invoice alerts

## Phase 5 — Expenses ⬜

- [ ] Expense entry
- [ ] Categories + auto deductibility
- [ ] Receipt attachment
- [ ] Filters and list view

## Phase 6 — Reports + Backup ⬜

- [ ] Dashboard
- [ ] Annual tax report
- [ ] PDF + CSV export
- [ ] Auto-backup on launch
- [ ] Restore from zip
- [ ] First launch restore flow

---

## Technical Decisions Made During Development

- **No drizzle-kit migrations** — using inline `runMigrations()` with `CREATE TABLE IF NOT EXISTS` in `db/schema.ts`. Simple and reliable for a single-user local app.
- **skipLibCheck: true** in tsconfig.node.json — drizzle-orm's own `.d.ts` files reference mysql2 and bun-types which aren't installed. This is a known upstream issue.
- **Puppeteer 24.42.0** — 22.x was deprecated at install time, upgraded immediately.
- **electron-vite entry points** — must be explicit in `build.rollupOptions.input` for main, preload, and renderer. The renderer root is `src/`, so HTML scripts use relative paths.

---

## Notes for Next Session

Start Phase 4 — Payments:
1. Record full or partial payment on a sent invoice
2. Methods: wire, cheque, interac, other
3. Attach payment proof (file picker → attachments/invoices/{id}/)
4. "Montant payé" in PDF totals should reflect actual payments once recorded (currently always 0,00)
5. Payments IPC handlers already exist in `electron/ipc/payments.ts`

Then Phase 5 — Expenses:
- CRUD with 12 categories, auto 50% deductible for business_meals
- Receipt attachment
