"use strict";
const electron = require("electron");
const api = {
  // Profile
  getProfile: () => electron.ipcRenderer.invoke("profile:get"),
  saveProfile: (data) => electron.ipcRenderer.invoke("profile:save", data),
  // Clients
  getClients: () => electron.ipcRenderer.invoke("clients:getAll"),
  getClient: (id) => electron.ipcRenderer.invoke("clients:getOne", id),
  createClient: (data) => electron.ipcRenderer.invoke("clients:create", data),
  updateClient: (id, data) => electron.ipcRenderer.invoke("clients:update", id, data),
  archiveClient: (id) => electron.ipcRenderer.invoke("clients:archive", id),
  // Invoices
  getInvoices: (filters) => electron.ipcRenderer.invoke("invoices:getAll", filters),
  getInvoice: (id) => electron.ipcRenderer.invoke("invoices:getOne", id),
  createInvoice: (data) => electron.ipcRenderer.invoke("invoices:create", data),
  updateInvoice: (id, data) => electron.ipcRenderer.invoke("invoices:update", id, data),
  updateInvoiceStatus: (id, status) => electron.ipcRenderer.invoke("invoices:updateStatus", id, status),
  getNextInvoiceNumber: () => electron.ipcRenderer.invoke("invoices:nextNumber"),
  // Expenses
  getExpenses: (filters) => electron.ipcRenderer.invoke("expenses:getAll", filters),
  createExpense: (data) => electron.ipcRenderer.invoke("expenses:create", data),
  updateExpense: (id, data) => electron.ipcRenderer.invoke("expenses:update", id, data),
  deleteExpense: (id) => electron.ipcRenderer.invoke("expenses:delete", id),
  // Payments
  getPayments: (invoiceId) => electron.ipcRenderer.invoke("payments:getForInvoice", invoiceId),
  createPayment: (data) => electron.ipcRenderer.invoke("payments:create", data),
  // PDF
  generateInvoicePdf: (invoiceId) => electron.ipcRenderer.invoke("pdf:generateInvoice", invoiceId),
  // Backup
  createBackup: () => electron.ipcRenderer.invoke("backup:create"),
  restoreBackup: (zipPath) => electron.ipcRenderer.invoke("backup:restore", zipPath),
  listBackups: () => electron.ipcRenderer.invoke("backup:list"),
  // File dialogs
  openFileDialog: (options) => electron.ipcRenderer.invoke("dialog:openFile", options),
  saveFileDialog: (options) => electron.ipcRenderer.invoke("dialog:saveFile", options),
  // Config
  getConfig: () => electron.ipcRenderer.invoke("config:get"),
  isFirstLaunch: () => electron.ipcRenderer.invoke("config:isFirstLaunch")
};
electron.contextBridge.exposeInMainWorld("api", api);
