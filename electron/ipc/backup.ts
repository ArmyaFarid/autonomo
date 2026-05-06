import { ipcMain, BrowserWindow } from "electron"
import { getDataRootPath, getDb, getRawDb, reinitDatabase, closeDatabase, profile as profileTable } from "../../db/schema"
import { join } from "path"
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync, rmSync } from "fs"
import AdmZip from "adm-zip"
import { createHash } from "crypto"
import { readFileSync } from "fs"

function getBackupsDir(): string {
    return join(getDataRootPath(), "backups")
}

function getDbPath(): string {
    return join(getDataRootPath(), "autonomo.db")
}

function getAttachmentsPath(): string {
    return join(getDataRootPath(), "attachments")
}

function computeChecksum(filePath: string): string {
    const content = readFileSync(filePath)
    return createHash("sha256").update(content).digest("hex")
}

function buildZip(destPath: string): void {
    // Force WAL checkpoint so autonomo.db on disk has all committed data
    try { getRawDb().pragma("wal_checkpoint(FULL)") } catch { /* no-op if not initialized */ }

    const zip = new AdmZip()
    const dbPath = getDbPath()
    if (existsSync(dbPath)) zip.addLocalFile(dbPath)

    const attachmentsPath = getAttachmentsPath()
    if (existsSync(attachmentsPath)) zip.addLocalFolder(attachmentsPath, "attachments")

    const manifest = {
        appVersion: "0.1.0",
        date: new Date().toISOString(),
        schemaVersion: 1,
        checksum: existsSync(dbPath) ? computeChecksum(dbPath) : "",
    }
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)))
    zip.writeZip(destPath)
}

function createBackupZip(backupsDir: string, retentionCount: number): string {
    if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true })

    const date = new Date().toISOString().split("T")[0]
    const zipPath = join(backupsDir, `autonomo-backup-${date}.zip`)

    buildZip(zipPath)
    pruneOldBackups(backupsDir, retentionCount)
    return zipPath
}

export function registerBackupHandlers(): void {
    ipcMain.handle("backup:create", () => {
        try {
            const db = getDb()
            const prof = db.select().from(profileTable).limit(1).all()[0]
            const retention = prof?.backupRetentionCount ?? 10
            const zipPath = createBackupZip(getBackupsDir(), retention)
            return { success: true, data: zipPath }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("backup:checkAuto", () => {
        try {
            const db = getDb()
            const prof = db.select().from(profileTable).limit(1).all()[0]
            if (!prof) return { success: true, data: { created: false } }

            const intervalDays = prof.backupIntervalDays ?? 7
            const retention = prof.backupRetentionCount ?? 10
            const backupsDir = getBackupsDir()

            // Find the most recent backup
            let lastBackupMs = 0
            if (existsSync(backupsDir)) {
                const zips = readdirSync(backupsDir).filter((f) => f.endsWith(".zip"))
                for (const f of zips) {
                    const mtime = statSync(join(backupsDir, f)).mtime.getTime()
                    if (mtime > lastBackupMs) lastBackupMs = mtime
                }
            }

            const daysSinceLast = (Date.now() - lastBackupMs) / 86400000
            if (lastBackupMs > 0 && daysSinceLast < intervalDays) {
                return { success: true, data: { created: false } }
            }

            const zipPath = createBackupZip(backupsDir, retention)
            return { success: true, data: { created: true, path: zipPath } }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("backup:list", () => {
        try {
            const backupsDir = getBackupsDir()
            if (!existsSync(backupsDir)) return { success: true, data: [] }

            const files = readdirSync(backupsDir)
                .filter((f) => f.endsWith(".zip"))
                .map((f) => ({
                    name: f,
                    path: join(backupsDir, f),
                    date: statSync(join(backupsDir, f)).mtime,
                }))
                .sort((a, b) => b.date.getTime() - a.date.getTime())

            return { success: true, data: files }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("backup:restore", (_event, zipPath: string) => {
        try {
            if (!existsSync(zipPath)) return { success: false, error: "Backup file not found" }

            const zip = new AdmZip(zipPath)
            const manifestEntry = zip.getEntry("manifest.json")
            if (!manifestEntry) return { success: false, error: "Invalid backup: missing manifest" }

            const manifest = JSON.parse(manifestEntry.getData().toString("utf-8"))
            if (!manifest.schemaVersion) return { success: false, error: "Invalid manifest format" }

            closeDatabase()
            // Remove WAL sidecar files so the restored autonomo.db is used as-is
            const walPath = getDbPath() + "-wal"
            const shmPath = getDbPath() + "-shm"
            if (existsSync(walPath)) rmSync(walPath)
            if (existsSync(shmPath)) rmSync(shmPath)
            zip.extractAllTo(getDataRootPath(), true)
            reinitDatabase()
            return { success: true, data: manifest }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("backup:exportTo", (_event, destPath: string) => {
        try {
            buildZip(destPath)
            return { success: true, data: destPath }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle("app:reloadWindow", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        // setImmediate lets the IPC response reach the renderer before the window is reloaded
        setImmediate(() => { if (win) win.reload() })
        return { success: true }
    })

}

export function pruneOldBackups(dir: string, keep: number): void {
    const files = readdirSync(dir)
        .filter((f) => f.endsWith(".zip"))
        .map((f) => ({ name: f, mtime: statSync(join(dir, f)).mtime.getTime() }))
        .sort((a, b) => b.mtime - a.mtime)

    files.slice(keep).forEach((f) => unlinkSync(join(dir, f.name)))
}
