# Role and Objective
You are an expert full-stack developer and Software Architect working on an existing React + TypeScript + Electron invoicing application.

We are doing a phased architectural refactor. **This is Phase 1.**
Do not worry about PDF generation, tax exports, or legacy imports right now. We are strictly focusing on fixing the database schema, state logic, and the UI/UX for these specific changes.

**CRITICAL RULE ON NAMING:** Treat the Target Architecture below as *conceptual*. You must look at my current database schema (e.g., my existing `payements` table) and adapt these concepts to fit my current naming conventions and structure. Do not invent new table names if I already have one that fits the purpose.

## Phase 1: Target Architecture

### 1. Status Separation (Document vs. Money)
Never mix document state with payment state.
*   **Database Record State:** Track the document's legal lifecycle (`DRAFT`, `ISSUED`, `VOIDED`).
*   **Computed UI State (NOT in DB):** Compute the payment status dynamically in the UI based on math (`Balance Due = Total - Payments - CreditNotes`).
    *   If `document_status` is VOIDED -> Show `VOID`.
    *   If `Balance Due <= 0` AND `Total Payments == 0` AND `CreditNotes > 0` -> Show `CANCELLED / CREDITED`.
    *   If `Balance Due <= 0` AND `Total Payments > 0` -> Show `PAID`.
    *   If `Balance Due > 0` AND `Total Payments > 0` -> Show `PARTIAL`.
    *   If `Balance Due == Invoice Total` AND `Total Payments == 0` -> Show `UNPAID`.

### 2. Invoice Numbering Engine
*   **Drafts:** Use internal hidden UUIDs. No official invoice number.
*   **Emission:** Generate the official number (`[YEAR]-[PADDED_NUMBER]`) *only* when transitioning from DRAFT to ISSUED. Implement a secure sequence tracking table to prevent collisions.

### 3. Financial Ledger
*   **Payments:** Track manual payments in my existing payments table. "Total Gain" is the sum of these payments.
*   **Credit Notes:** Implement a way to reduce the "Balance Due" without affecting the "Total Gain" cash flow when an issued invoice needs a price adjustment.

---

## UI & UX Standards (CRITICAL)
When writing the React components for these features, you must adhere to the following rules:

*   **1. Internationalization (i18n):** Do not hardcode user-facing strings in English. The app uses translation. Use our existing translation methods (e.g., `t('status.issued')` or equivalent) for all labels, badges, and messages.
*   **2. Educational Tooltips (Hints):** Next to complex UI terms (like the computed status badges), include a small "Info" or "Hint" icon button. When hovered/clicked, it should explain the concept simply to the user.
*   **3. The Unified Cancellation Workflow (Intent-Based UI):**
    To keep the UI simple, provide a single "Cancel Invoice" button for ISSUED invoices.
    *   When clicked, open a modal asking: *"Why are you cancelling this invoice?"* with two options:
    *   **Option A ("I made a mistake / Never sent to client"):** Automatically routes the backend to execute a **VOID** action.
    *   **Option B ("Client backed out / Refused to pay"):** Automatically routes the backend to issue a **CREDIT NOTE**.
    *   This wizard hides the accounting complexity (Void vs Credit Note) from the user while ensuring legal compliance based on their reason.
*   **4. Smart Confirmation Modals:** For every major financial action (Emit, or the final step of the Cancel workflow), trigger a confirmation modal BEFORE executing.
    *   The modal must clearly explain the *effect* of the action.
    *   Include a checkbox: "[ ] Do not show this warning again" (save this preference in local storage or user settings so power users can bypass it later).

---

## Your Task Execution Steps
Execute in this strict order:

1.  **Look for my code base existing libs/function etc...**
2.  **Gap Analysis & Schema Mapping:** Once I provide the code, output a clear bulleted list comparing my current architecture to this Phase 1 Target Architecture. Tell me exactly how you plan to map these concepts to my existing tables, which columns need to be added/dropped, and what logic needs to change.
3.  **Migration Code:** Provide the TypeScript/Electron refactoring code step-by-step for the database migrations, state calculations, and the React UI components featuring the tooltips and smart modals.
