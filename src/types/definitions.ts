export interface IpcResponse<T = undefined> {
    success: boolean
    data?: T
    error?: string
}

export interface Profile {
    id: number
    name: string
    address: string
    appPin: string | null
    touchIdEnabled: number
    phone: string | null
    email: string | null
    gstNumber: string | null
    qstNumber: string | null
    defaultHourlyRate: number
    invoiceStartNumber: number
    invoiceNumberFormat: string
    invoicePrefix: string
    city: string | null
    province: string | null
    country: string | null
    postalCode: string | null
    dataRootPath: string | null
    logoPath: string | null
    locale: string
    backupIntervalDays: number
    backupRetentionCount: number
    lateInvoiceAlertDays: number
    taxReserveRate: number
    createdAt: string
    updatedAt: string
}

export interface Client {
    id: number
    name: string
    companyName: string | null
    address: string
    phone: string | null
    email: string | null
    primaryContact: string | null
    billingType: "hourly" | "fixed"
    hourlyRate: number | null
    defaultHoursPerPeriod: number | null
    billingFrequency: "biweekly" | "monthly" | "one-time"
    active: number
    notes: string | null
    createdAt: string
    updatedAt: string
}

export interface InvoiceLine {
    id: number
    invoiceId: number
    position: number
    label: string
    description: string | null
    qty: number
    unitPrice: number
    amount: number
    createdAt: string
}

// Phase 1: status is now the document lifecycle only (draft | issued | voided).
// Payment status (unpaid / partial / paid / credited) is computed from payments + credit notes.
export interface Invoice {
    id: number
    number: string
    clientId: number
    issueDate: string
    periodStart: string
    periodEnd: string
    invoiceType: "weekly" | "freeform" | "imported"
    description: string
    subtotal: number
    gstRate: number
    qstRate: number
    gstAmount: number
    qstAmount: number
    total: number
    dueDate: string | null
    status: "draft" | "issued" | "voided"
    notes: string | null
    pdfPath: string | null
    creditedPdfPath: string | null
    createdAt: string
    updatedAt: string
    // Denormalized fields returned by the backend for computed status
    totalPaid?: number
    totalCredit?: number
}

export interface InvoiceAttachment {
    id: number
    invoiceId: number
    name: string
    path: string
    type: string
    createdAt: string
}

export interface Payment {
    id: number
    invoiceId: number
    paymentDate: string
    amount: number
    paymentMethod: "wire" | "cheque" | "interac" | "other"
    reference: string | null
    notes: string | null
    proofPath: string | null
    receiptNumber: string | null
    receiptPath: string | null
    createdAt: string
}

// Cash received per payment, enriched with invoice context — used by dashboard and reports
export interface PaymentReport {
    id: number
    invoiceId: number
    invoiceNumber: string
    invoiceTotal: number
    clientId: number
    issueDate: string
    paymentDate: string
    amount: number
    paymentMethod: string
}

// Phase 1 — credit notes reduce balance-due without affecting cash-flow total
export interface CreditNote {
    id: number
    invoiceId: number
    number?: string
    amount: number
    reason: string
    pdfPath?: string
    createdAt: string
}

export interface Expense {
    id: number
    date: string
    amount: number
    description: string
    category: string
    deductibleRate: number
    gstPaid: number
    qstPaid: number
    receiptPath: string | null
    notes: string | null
    year: number
    createdAt: string
}

export type ExpenseCategory =
    | "office_supplies"
    | "telecom"
    | "transport"
    | "training"
    | "equipment"
    | "business_meals"
    | "home_office"
    | "software"
    | "hosting"
    | "domains"
    | "api_credits"
    | "other"

// Phase 1 — computed payment status (never stored in DB)
export type ComputedPaymentStatus = "draft" | "unpaid" | "partial" | "paid" | "credited" | "voided"

export function computePaymentStatus(
    invoice: Pick<Invoice, "status" | "total">,
    totalPaid: number,
    totalCredit: number,
): ComputedPaymentStatus {
    if (invoice.status === "voided") return "voided"
    if (invoice.status === "draft") return "draft"
    const balance = invoice.total - totalPaid - totalCredit
    if (balance <= 0.01 && totalPaid === 0 && totalCredit > 0) return "credited"
    if (balance <= 0.01) return "paid"
    if (totalPaid > 0 || totalCredit > 0) return "partial"
    return "unpaid"
}
