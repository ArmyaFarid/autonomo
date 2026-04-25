import { contextBridge, ipcRenderer } from "electron"

const api = {
    // Profile
    getProfile: () => ipcRenderer.invoke("profile:get"),
    saveProfile: (data: unknown) => ipcRenderer.invoke("profile:save", data),

    // Clients
    getClients: () => ipcRenderer.invoke("clients:getAll"),
    getClient: (id: number) => ipcRenderer.invoke("clients:getOne", id),
    createClient: (data: unknown) => ipcRenderer.invoke("clients:create", data),
    updateClient: (id: number, data: unknown) => ipcRenderer.invoke("clients:update", id, data),
    archiveClient: (id: number) => ipcRenderer.invoke("clients:archive", id),

    // Invoices
    getInvoices: (filters?: unknown) => ipcRenderer.invoke("invoices:getAll", filters),
    getInvoice: (id: number) => ipcRenderer.invoke("invoices:getOne", id),
    getInvoiceAttachments: (invoiceId: number) => ipcRenderer.invoke("invoices:getAttachments", invoiceId),
    addInvoiceAttachment: (data: unknown) => ipcRenderer.invoke("invoices:addAttachment", data),
    attachImportedPdf: (data: unknown) => ipcRenderer.invoke("invoices:attachImportedPdf", data),
    deleteInvoiceAttachment: (id: number) => ipcRenderer.invoke("invoices:deleteAttachment", id),
    createInvoice: (data: unknown) => ipcRenderer.invoke("invoices:create", data),
    updateInvoice: (id: number, data: unknown) => ipcRenderer.invoke("invoices:update", id, data),
    updateInvoiceStatus: (id: number, status: string) =>
        ipcRenderer.invoke("invoices:updateStatus", id, status),
    reopenInvoice: (id: number) => ipcRenderer.invoke("invoices:reopen", id),
    getNextInvoiceNumber: () => ipcRenderer.invoke("invoices:nextNumber"),

    // Expenses
    getExpenses: (filters?: unknown) => ipcRenderer.invoke("expenses:getAll", filters),
    createExpense: (data: unknown) => ipcRenderer.invoke("expenses:create", data),
    updateExpense: (id: number, data: unknown) => ipcRenderer.invoke("expenses:update", id, data),
    deleteExpense: (id: number) => ipcRenderer.invoke("expenses:delete", id),
    addExpenseReceipt: (data: unknown) => ipcRenderer.invoke("expenses:addReceipt", data),
    deleteExpenseReceipt: (expenseId: number) => ipcRenderer.invoke("expenses:deleteReceipt", expenseId),

    // Payments
    getPayments: (invoiceId: number) => ipcRenderer.invoke("payments:getForInvoice", invoiceId),
    createPayment: (data: unknown) => ipcRenderer.invoke("payments:create", data),
    updatePayment: (id: number, data: unknown) => ipcRenderer.invoke("payments:update", id, data),
    deletePayment: (id: number) => ipcRenderer.invoke("payments:delete", id),
    addPaymentProof: (data: unknown) => ipcRenderer.invoke("payments:addProof", data),

    // PDF
    generateInvoicePdf: (invoiceId: number) => ipcRenderer.invoke("pdf:generateInvoice", invoiceId),

    // Reports
    exportReportCsv: (year: number) => ipcRenderer.invoke("reports:exportCsv", year),
    exportReportPdf: (year: number) => ipcRenderer.invoke("reports:exportPdf", year),

    // Backup
    createBackup: () => ipcRenderer.invoke("backup:create"),
    restoreBackup: (zipPath: string) => ipcRenderer.invoke("backup:restore", zipPath),
    listBackups: () => ipcRenderer.invoke("backup:list"),

    // File dialogs & shell
    openFileDialog: (options: unknown) => ipcRenderer.invoke("dialog:openFile", options),
    saveFileDialog: (options: unknown) => ipcRenderer.invoke("dialog:saveFile", options),
    openPath: (filePath: string) => ipcRenderer.invoke("shell:openPath", filePath),

    // Config
    getConfig: () => ipcRenderer.invoke("config:get"),
    isFirstLaunch: () => ipcRenderer.invoke("config:isFirstLaunch"),
}

contextBridge.exposeInMainWorld("api", api)

export type ElectronAPI = typeof api
