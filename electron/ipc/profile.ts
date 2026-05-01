import { ipcMain, dialog, shell, BrowserWindow, systemPreferences } from "electron"
import { eq } from "drizzle-orm"
import { getDb, getDataRootPath, profile } from "../../db/schema"
import { randomBytes, scryptSync, timingSafeEqual } from "crypto"
import { join } from "path"
import { existsSync, mkdirSync } from "fs"

function hashPin(pin: string): string {
    const salt = randomBytes(16).toString("hex")
    const derived = scryptSync(pin, salt, 64).toString("hex")
    return `${salt}$${derived}`
}

function verifyPin(pin: string, stored: string): boolean {
    try {
        const [salt, hash] = stored.split("$")
        const derived = scryptSync(pin, salt, 64)
        return timingSafeEqual(Buffer.from(hash, "hex"), derived)
    } catch {
        return false
    }
}

export function registerProfileHandlers(): void {
    ipcMain.handle("profile:get", () => {
        try {
            const db = getDb()
            const result = db.select().from(profile).limit(1).all()
            const row = result[0] ?? null
            // Mask the hash — renderer only needs to know if a PIN is set
            if (row) return { success: true, data: { ...row, appPin: row.appPin ? "***" : null } }
            return { success: true, data: null }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("profile:setPin", (_event, pin: string) => {
        try {
            const db = getDb()
            db.update(profile)
                .set({ appPin: hashPin(pin), updatedAt: new Date().toISOString() })
                .where(eq(profile.id, 1))
                .run()
            const row = db.select().from(profile).limit(1).all()[0]
            return { success: true, data: { ...row, appPin: "***" } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("profile:removePin", () => {
        try {
            const db = getDb()
            db.update(profile)
                .set({ appPin: null, updatedAt: new Date().toISOString() })
                .where(eq(profile.id, 1))
                .run()
            const row = db.select().from(profile).limit(1).all()[0]
            return { success: true, data: { ...row, appPin: null } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("auth:touchIdAvailable", () => {
        try {
            const available = process.platform === "darwin" && systemPreferences.canPromptTouchID()
            return { success: true, data: available }
        } catch {
            return { success: true, data: false }
        }
    })

    ipcMain.handle("auth:promptTouchId", async () => {
        try {
            await systemPreferences.promptTouchID("déverrouiller Armya Facturation")
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("profile:setTouchId", (_event, enabled: boolean) => {
        try {
            const db = getDb()
            db.update(profile)
                .set({ touchIdEnabled: enabled ? 1 : 0, updatedAt: new Date().toISOString() })
                .where(eq(profile.id, 1))
                .run()
            const row = db.select().from(profile).limit(1).all()[0]
            return { success: true, data: { ...row, appPin: row.appPin ? "***" : null } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("profile:verifyPin", (_event, pin: string) => {
        try {
            const db = getDb()
            const row = db.select().from(profile).limit(1).all()[0]
            if (!row?.appPin) return { success: true, data: { valid: false } }
            return { success: true, data: { valid: verifyPin(pin, row.appPin) } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("profile:save", (_event, data: typeof profile.$inferInsert) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()
            const existing = db.select().from(profile).limit(1).all()

            if (existing.length === 0) {
                db.insert(profile)
                    .values({ ...data, id: 1, createdAt: now, updatedAt: now })
                    .run()
            } else {
                db.update(profile)
                    .set({ ...data, updatedAt: now })
                    .where(eq(profile.id, 1))
                    .run()
            }

            const updated = db.select().from(profile).limit(1).all()
            return { success: true, data: updated[0] }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("config:get", () => {
        try {
            const db = getDb()
            const result = db.select().from(profile).limit(1).all()
            return { success: true, data: result[0] ?? null }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("config:isFirstLaunch", () => {
        try {
            const db = getDb()
            const result = db.select().from(profile).limit(1).all()
            return { success: true, data: result.length === 0 }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("dialog:openFile", async (event, options: Electron.OpenDialogOptions) => {
        try {
            const win = BrowserWindow.fromWebContents(event.sender)
            const result = win
                ? await dialog.showOpenDialog(win, options)
                : await dialog.showOpenDialog(options)
            return { success: true, data: result.canceled ? null : result.filePaths }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("dialog:saveFile", async (event, options: Electron.SaveDialogOptions) => {
        try {
            const win = BrowserWindow.fromWebContents(event.sender)
            const result = win
                ? await dialog.showSaveDialog(win, options)
                : await dialog.showSaveDialog(options)
            return { success: true, data: result.canceled ? null : result.filePath }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("shell:openPath", async (_event, filePath: string) => {
        try {
            const errMsg = await shell.openPath(filePath)
            if (errMsg) return { success: false, error: errMsg }
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Phase 3 — open the tax exports folder in Finder/Explorer
    ipcMain.handle("shell:openTaxFolder", async () => {
        try {
            const exportsDir = join(getDataRootPath(), "exports")
            if (!existsSync(exportsDir)) mkdirSync(exportsDir, { recursive: true })
            const errMsg = await shell.openPath(exportsDir)
            if (errMsg) return { success: false, error: errMsg }
            return { success: true, data: exportsDir }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

}
