export interface IpcResponse<T = undefined> {
    success: boolean
    data?: T
    error?: string
}

export interface Profile {
    id: number
    name: string
    address: string
    phone: string | null
    email: string | null
    gstNumber: string | null
    qstNumber: string | null
    defaultHourlyRate: number
    invoiceStartNumber: number
    invoiceNumberFormat: string
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
    status: "draft" | "sent" | "paid" | "overdue" | "refused" | "cancelled"
    notes: string | null
    pdfPath: string | null
    createdAt: string
    updatedAt: string
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
