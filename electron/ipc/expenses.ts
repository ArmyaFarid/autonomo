import { ipcMain } from "electron"
import { eq } from "drizzle-orm"
import { getDb, expenses, profile, getDataRootPath } from "../../db/schema"
import { copyFileSync, mkdirSync, existsSync, unlinkSync } from "fs"
import { join, basename } from "path"
import { buildSlug, resolveDestPath } from "./utils"

export function registerExpenseHandlers(): void {
    ipcMain.handle("expenses:getAll", (_event, filters?: { year?: number; category?: string }) => {
        try {
            const db = getDb()
            let result = db.select().from(expenses).all()
            if (filters?.year) result = result.filter((e) => e.year === filters.year)
            if (filters?.category) result = result.filter((e) => e.category === filters.category)
            return { success: true, data: result }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("expenses:create", (_event, data: typeof expenses.$inferInsert) => {
        try {
            const db = getDb()
            const now = new Date().toISOString()
            const result = db
                .insert(expenses)
                .values({ ...data, createdAt: now })
                .returning()
                .all()
            return { success: true, data: result[0] }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("expenses:update", (_event, id: number, data: Partial<typeof expenses.$inferInsert>) => {
        try {
            const db = getDb()
            const result = db
                .update(expenses)
                .set(data)
                .where(eq(expenses.id, id))
                .returning()
                .all()
            return { success: true, data: result[0] }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("expenses:delete", (_event, id: number) => {
        try {
            const db = getDb()
            db.delete(expenses).where(eq(expenses.id, id)).run()
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("expenses:addReceipt", (_event, data: { expenseId: number; sourcePath: string }) => {
        try {
            const db = getDb()
            const expense = db.select().from(expenses).where(eq(expenses.id, data.expenseId)).limit(1).all()[0]
            if (!expense) return { success: false, error: "Expense not found" }
            const prof = db.select().from(profile).limit(1).all()[0]

            // Delete old receipt file if replacing
            if (expense.receiptPath && existsSync(expense.receiptPath)) unlinkSync(expense.receiptPath)

            const year = expense.date.substring(0, 4)
            const userSlug = buildSlug(prof?.name ?? "user")
            const originalName = basename(data.sourcePath)
            const newName = `receipt_${userSlug}_id${data.expenseId}_${expense.date}_${expense.category}_${originalName}`

            const destDir = join(getDataRootPath(), "attachments", "expenses", year)
            if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
            const destPath = resolveDestPath(destDir, newName)
            copyFileSync(data.sourcePath, destPath)
            db.update(expenses).set({ receiptPath: destPath }).where(eq(expenses.id, data.expenseId)).run()
            return { success: true, data: destPath }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("expenses:deleteReceipt", (_event, expenseId: number) => {
        try {
            const db = getDb()
            const expense = db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1).all()[0]
            if (!expense) return { success: false, error: "Expense not found" }
            if (expense.receiptPath && existsSync(expense.receiptPath)) unlinkSync(expense.receiptPath)
            db.update(expenses).set({ receiptPath: null }).where(eq(expenses.id, expenseId)).run()
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })
}
