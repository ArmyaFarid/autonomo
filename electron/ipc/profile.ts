import { ipcMain, dialog, shell } from "electron"
import { eq } from "drizzle-orm"
import { getDb, getDataRootPath, profile } from "../../db/schema"

export function registerProfileHandlers(): void {
    ipcMain.handle("profile:get", () => {
        try {
            const db = getDb()
            const result = db.select().from(profile).limit(1).all()
            return { success: true, data: result[0] ?? null }
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

    ipcMain.handle("dialog:openFile", (_event, options: Electron.OpenDialogOptions) => {
        try {
            const result = dialog.showOpenDialogSync(options)
            return { success: true, data: result ?? null }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("dialog:saveFile", (_event, options: Electron.SaveDialogOptions) => {
        try {
            const result = dialog.showSaveDialogSync(options)
            return { success: true, data: result ?? null }
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
}
