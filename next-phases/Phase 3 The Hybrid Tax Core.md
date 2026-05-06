# Role and Objective
You are an expert full-stack developer and Software Architect working on our React + TypeScript + Electron invoicing application.

We are executing a phased architectural refactor. **This is Phase 3: The Hybrid Tax Core (Anti-Fragile Ledger).**
Phases 1 and 2 (State logic and PDF Vault) are complete. Your goal now is to implement a bulletproof, dual-layer financial ledger that protects the user's data for tax purposes, even if the application UI or main database becomes corrupted in the future.

**CRITICAL RULE:** Do not invent new table names or file utilities blindly. Look at my current database schema and Electron file-system utilities to adapt these concepts to my existing architecture.

## Phase 3: Target Architecture (Hybrid Tax Core)

### 1. The Immutable DB Ledger
We need a strictly **append-only** table in the SQLite database to track every single financial event that changes the user's total gain or balance due.
*   **Events to track:** Invoice Issued, Payment Received, Refund Issued, Credit Note Applied.
*   **The Golden Rule:** NO `UPDATE` or `DELETE` statements are ever allowed on this table. If a mistake is made (e.g., a payment was recorded incorrectly), the system must append a *reversal* row (e.g., a negative payment) to correct the math.

### 2. The Shadow CSV (Automated Tax Export)
Every single time an event is successfully appended to the Immutable DB Ledger, the Electron backend must simultaneously append a corresponding row to a plain-text `.csv` file on the user's local file system.
*   **File Location:** Save this in the same safe directory as our PDFs (e.g., `Documents/[App Name]/Exports/Tax_Ledger_2026.csv`).
*   **Data Formatting:** The CSV must be easily readable by Microsoft Excel or Apple Numbers. Include columns like: `Date`, `Event Type`, `Reference ID` (Invoice Number), `Client Name`, `Amount`, and `Running Total Gain`.

---

## UI & UX Standards (CRITICAL)
*   **1. Internationalization (i18n):** The headers and event types written into the CSV should use our translated strings so the resulting Excel file is in the user's preferred language.
*   **2. Educational UX (The "Tax Ready" Feature):** Add a section in the application "Settings" or "Dashboard" called "Data & Taxes".
    *   Include a button that says "Open Tax Folder" which uses Electron's `shell.showItemInFolder` to reveal the CSV file to the user.
    *   Add a helpful tooltip explaining: *"Your financial records are automatically synced to an Excel-ready spreadsheet here. You can send this file directly to your accountant during tax season."*

---

## Your Task Execution Steps
Execute in this strict order:

1.  **Ask for my code:** Prompt me to paste my current database schema (so you can see how to link the new ledger to my invoices/payments), and my current Electron IPC handlers for file saving. (Wait for my response).
2.  **Gap Analysis & Strategy:** Once I provide the code, explain exactly how you will structure the `INSERT` transactions to guarantee the DB and CSV write simultaneously without failing one or the other.
3.  **Migration Code:** Provide the TypeScript/Electron code step-by-step for the Immutable Table creation, the CSV appending logic, and the UI Settings component to open the folder.
