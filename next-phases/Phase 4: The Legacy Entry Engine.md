# Role and Objective
You are an expert full-stack developer and Software Architect working on our React + TypeScript + Electron invoicing application.

We are executing the final phase of our architectural refactor. **This is Phase 4: The Legacy Invoice Entry Engine.**
Phases 1-3 (State logic, PDF Vault, and Hybrid Tax Core) are complete. Your goal now is to build a specialized, smart UI form that allows users to manually record historical/legacy invoices (sent or paid outside the app) one-by-one, while ensuring absolute consistency with our new architecture.

**CRITICAL RULE:** Do not invent new table names or attachment systems. Look at my current database schema and my *existing attachment logic* to adapt these concepts to my architecture.

## Phase 4: Target Architecture (Legacy Entry Engine)

### 1. The "Record Legacy Invoice" Form
Create a distinct UI form separate from the standard "Draft Invoice" flow. This form is specifically for injecting historical data.
*   **Required Fields:** Basic info, original issue date, legacy invoice number, and file upload fields linking to our *existing* attachment system (for the original invoice PDF).
*   **Strict Historical Integrity (NO Normalization):** Unlike new invoices, legacy invoice numbers must be saved **exactly as the user types them** (e.g., `02`, `Facture-45`, `2022_A`). Do not apply any normalization or formatting to this field. The database record must perfectly match the physical PDF attachment they are uploading.

### 2. Historical Collision Prevention
Before allowing the form submission, the system must check the sequence tracking table/invoices table.
*   **Exact Match Check:** Check if the exact raw string the user typed already exists for that specific year.
*   **Safety Lock:** If it exists, disable the submit button and show a hard error: *"This exact invoice number already exists in the system. Historical records cannot be duplicated."*
*   (Do NOT auto-suggest a new number, as the user cannot change a historical document's number).

### 3. Integrated Payment Sync & Proofs
Because the new system calculates payment status dynamically, this legacy form must handle historical payments immediately.
*   **Payment Toggle:** Include a toggle/checkbox: *"Has this legacy invoice already been paid?"*
*   **Conditional Fields:** If checked, reveal fields for `Payment Date`, `Amount Paid`, and a file upload field for `Payment Proof` (linking to our existing attachment system).
*   **Simultaneous Transaction:** On submit, the backend must insert the Invoice record AND the Payment Transaction record into the Immutable DB Ledger in a single transaction, ensuring the invoice immediately computes as `PAID`.

---

## UI & UX Standards (CRITICAL)
*   **1. Internationalization (i18n):** All form labels, errors, and success messages must use our existing translation methods.
*   **2. Educational UX:** Add a hint/tooltip at the top of the form: *"Use this form to record past invoices. Type the invoice number exactly as it appears on your original document to maintain a perfect audit trail."*
*   **3. Form Distinction:** Visually style this form slightly differently from the standard "New Invoice" form (e.g., a different header icon, a subtle historical/sepia background tint) so the user knows they are recording history, not drafting a new bill.

---

## Your Task Execution Steps
Execute in this strict order:

1.  **Ask for my code:** Prompt me to paste my current UI form for invoices, my existing attachment/file upload logic, and the database functions for inserting invoices and payments. (Wait for my response).
2.  **Gap Analysis & Strategy:** Once I provide the code, explain exactly how you will handle the raw string input safely, and how you will structure the database transaction to save the invoice, the payment, and the attachments together.
3.  **Migration Code:** Provide the TypeScript/Electron code step-by-step for the Legacy Form UI, the Collision Check logic, and the backend submit handler.
