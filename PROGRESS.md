# PROGRESS.md — ArmyaFacturation

> Updated by Claude Code at the end of every session. Reflects the exact state of the project at all times. Always read this before starting any work.

---

## Overall Status: 🟡 Phase 2 — In progress (Settings + Clients done, Invoices next)

**Last updated:** 2026-04-22
**Last session summary:** Phase 2 complete. Settings + Clients UI built. Fixed 5 hardcoded strings that bypassed i18n (settings GST/QST/start number labels, archive confirm message, hours-per-week hint). All strings now go through t(). Clarified that client defaultHoursPerPeriod = hours PER WEEK (pre-fills both week 1 and week 2 on invoice creation, editable per invoice). Hourly rate also pre-filled from client but editable per invoice.

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

## Phase 3 — Invoices core ⬜

- [ ] Invoice creation — Type A (standard hourly)
- [ ] PDF generation with Puppeteer
- [ ] invoice-default.html template — Quebec compliant
- [ ] Status management (draft / sent / paid / overdue)
- [ ] Hours proof attachments

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

Start Phase 3 — Invoices core:
1. `src/pages/invoices/invoices-page.tsx` — invoice list with status badges + filters
2. `src/pages/invoices/create-invoice-page.tsx` — full invoice creation form (client picker, period, hours week 1/2, rate, description picker, GST/QST toggle)
3. PDF generation flow — Puppeteer via `window.api.generateInvoicePdf(id)`
4. Status transitions: draft → sent → paid
5. All IPC handlers already implemented
