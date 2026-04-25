import { ipcMain } from "electron"
import { eq } from "drizzle-orm"
import { getDb, clients } from "../../db/schema"

export function registerClientHandlers(): void {
    ipcMain.handle("clients:getAll", () => {
        try {
            const db = getDb()
            const result = db.select().from(clients).all()
            return { success: true, data: result }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("clients:getOne", (_event, id: number) => {
        try {
            const db = getDb()
            const result = db.select().from(clients).where(eq(clients.id, id)).limit(1).all()
            return { success: true, data: result[0] ?? null }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("clients:create", (_event, data: typeof clients.$inferInsert) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()
            const result = db
                .insert(clients)
                .values({ ...data, createdAt: now, updatedAt: now })
                .returning()
                .all()
            return { success: true, data: result[0] }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("clients:update", (_event, id: number, data: Partial<typeof clients.$inferInsert>) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()
            const result = db
                .update(clients)
                .set({ ...data, updatedAt: now })
                .where(eq(clients.id, id))
                .returning()
                .all()
            return { success: true, data: result[0] }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("clients:archive", (_event, id: number) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()
            db.update(clients)
                .set({ active: 0, updatedAt: now })
                .where(eq(clients.id, id))
                .run()
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })
}
