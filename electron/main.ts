import { app, BrowserWindow, shell, ipcMain } from "electron"
import { join } from "path"
import { electronApp, optimizer, is } from "@electron-toolkit/utils"
import { initDatabase, closeDatabase } from "../db/schema"
import { registerClientHandlers } from "./ipc/clients"
import { registerInvoiceHandlers } from "./ipc/invoices"
import { registerExpenseHandlers } from "./ipc/expenses"
import { registerPaymentHandlers } from "./ipc/payments"
import { registerPdfHandlers } from "./ipc/pdf"
import { registerBackupHandlers } from "./ipc/backup"
import { registerProfileHandlers } from "./ipc/profile"
import { registerReportHandlers } from "./ipc/reports"

function createWindow(): void {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 600,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname, "../preload/index.js"),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        },
    })

    mainWindow.on("ready-to-show", () => {
        mainWindow.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: "deny" }
    })

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
        mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"])
    } else {
        mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
    }
}

app.whenReady().then(() => {
    electronApp.setAppUserModelId("com.armyabakouan.autonomo")

    app.on("browser-window-created", (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    initDatabase()

    registerProfileHandlers()
    registerClientHandlers()
    registerInvoiceHandlers()
    registerExpenseHandlers()
    registerPaymentHandlers()
    registerPdfHandlers()
    registerBackupHandlers()
    registerReportHandlers()

    createWindow()

    app.on("activate", function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on("before-quit", () => {
    closeDatabase()
})

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit()
    }
})
