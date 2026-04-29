# Role and Objective
You are an expert full-stack developer and Software Architect working on our React + TypeScript + Electron invoicing application.

We are executing a phased architectural refactor. **This is Phase 2: The Reactive PDF Vault.**
Phase 1 (Database schema, document statuses, and payment logic) is already complete. Your goal now is to automate our PDF generation and file-system tracking.

**CRITICAL RULE:** Do not invent new PDF libraries. You must look at my current PDF generation code and adapt this new logic using the library I am already using.

## Phase 2: Target Architecture (Reactive PDF Engine)

### 1. Automated Generation (No Manual Clicks)
*   We no longer rely on a manual "Generate PDF" button for legal state changes.
*   **The Watcher:** Implement a reactive hook (frontend) or IPC watcher (Electron backend). Whenever an invoice's `document_status` changes to `ISSUED` or `VOIDED`, or when a Credit Note is fully applied (creating a `CANCELLED / CREDITED` computed state), the system must **automatically** build/rebuild the PDF in the background.

### 2. Local File Versioning (The Vault)
*   Do not overwrite old files. Save these automatically in a dedicated local folder (e.g., `Documents/[App Name]/PDFs/[Year]/`).
*   **Filename Tagging (RESPECT CURRENT NAMING):** Look at my current code to see how I name my PDF files. Keep that exact base naming convention, but **append the new state suffix** to it so I have a perfect historical record.
    *   Example: `[MyCurrentNamingConvention]_ISSUED.pdf`
    *   Example: `[MyCurrentNamingConvention]_VOIDED.pdf`
    *   Example: `[MyCurrentNamingConvention]_CREDITED.pdf`

### 3. Automated Watermarks (Filigranes)
*   If the PDF is being generated for a `VOIDED` invoice, automatically overlay the text **"VOID / ANNULÉ"** diagonally in large, semi-transparent letters across the PDF.
*   If the PDF is being generated for an invoice that has been fully cancelled via a Credit Note, overlay **"CREDITED / CRÉDITÉ"**.

---

## UI & UX Standards (CRITICAL)
*   **1. Internationalization (i18n):** Ensure the watermarks and any UI notifications use our translation system.
*   **2. Educational UX:** In the UI where the user views the invoice, add a small info tooltip next to the PDF icon explaining: *"PDFs are automatically generated and saved to your computer whenever the invoice status changes."*
*   **3. Background Loading State:** If the PDF generation takes a second, ensure the UI shows a subtle "Generating official document..." spinner so the user knows the background process is running.

---

## Your Task Execution Steps
Execute in this strict order:

1.  **Look for my code base existing libs/function etc...**
2.  **Gap Analysis & Schema Mapping:** Once I provide the code, output a clear bulleted list comparing my current architecture to this Phase 1 Target Architecture. Tell me exactly how you plan to map these concepts to my existing tables, which columns need to be added/dropped, and what logic needs to change.
3.  **Migration Code:** Provide the TypeScript/Electron refactoring code step-by-step for the database migrations, state calculations, and the React UI components featuring the tooltips and smart modals.
