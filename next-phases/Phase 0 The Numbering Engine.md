# Role and Objective
You are an expert full-stack developer and Software Architect working on our React + TypeScript + Electron invoicing application.

We are executing a major architectural refactor. **This is Phase 0: The Numbering Engine & Global Settings.**
Before we touch document statuses or PDFs, we must build a flawless, professional numbering foundation based on an **Annual Reset** strategy.

**CRITICAL RULE:** Do not invent new table names blindly. Look at my current database schema and adapt these concepts to my existing architecture.

## Phase 0: Target Architecture (Numbering Foundation)

### 1. Global Settings (The Business Identity)
We need a way to store the user's business preferences permanently.
*   **Database:** Create or update a `user_settings` table (a single-row table or key-value store).
*   **Fields:** It must store `invoice_prefix` (e.g., `"FAC-"`, `"INV-"`, or `""`) and `next_sequence_start` (an integer allowing the user to start their very first invoice at a number higher than 1).

### 2. The Annual Sequence Tracker (Auto-Rollover)
Invoice numbers must automatically reset to `0001` every year, while guaranteeing no duplicates.
*   **Database:** Create an `invoice_sequences` table tracking `year` (YYYY) and `last_sequence_number` (Integer).

### 3. The Generator Utility (Transactional & Hardcoded)
Create a backend utility function `generateNextInvoiceNumber(year: number)`.
*   **The Logic:**
    1. Query `invoice_sequences` for the given year.
    2. If the year exists: `new_sequence = last_sequence_number + 1`.
    3. If the year does NOT exist (New Year / First Invoice): `new_sequence = user_settings.next_sequence_start` (or default to `1` if the setting is empty).
*   **The Output String:** Combine the settings prefix, the year, and the padded sequence: `[PREFIX][YEAR]-[PADDED_SEQUENCE]`. (e.g., `FAC-2026-0001`).
*   **Transactional Safety:** This function MUST use a database transaction (or an atomic lock) to read the sequence, increment it, and return the hardcoded string. This prevents race conditions if the user clicks quickly.
*   **Hardcoded Identity:** The resulting string (`FAC-2026-0001`) is what gets permanently saved to the main `invoices` table. It is NOT computed on the frontend.

---

## UI & UX Standards (CRITICAL)
*   **1. Internationalization (i18n):** Use our existing translation methods for all UI text.
*   **2. Settings Panel:** Build a React component for the App Settings where the user can define their `invoice_prefix` and `next_sequence_start`.
*   **3. Live Preview:** Next to the inputs in the Settings panel, show a dynamic preview of what their next invoice number will look like (e.g., *"Preview: FAC-2026-0001"*).
*   **4. Educational Tooltip:** Add a hint explaining: *"Changing the prefix only affects new invoices. Your past invoices will retain their original numbers for legal compliance."*

---

## Your Task Execution Steps
Execute in this strict order:

1.  **Ask for my code:** Prompt me to paste my current database schema (so you can see where to add settings/sequences), my current database connection setup (to write the transaction), and my i18n setup. (Wait for my response).
2.  **Gap Analysis & Strategy:** Once I provide the code, explain exactly how you will structure the `invoice_sequences` table and how you will guarantee transactional safety in SQLite/Electron to prevent duplicates.
3.  **Migration Code:** Provide the TypeScript/Electron code step-by-step for the DB migrations, the Generator Utility, and the React Settings component.
