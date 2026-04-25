import { ipcMain } from "electron"
import { getDataRootPath } from "../../db/schema"
import { join } from "path"
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from "fs"
import AdmZip from "adm-zip"
import { createHash } from "crypto"
import { readFileSync } from "fs"

function getBackupsDir(): string {
    return join(getDataRootPath(), "backups")
}

function getDbPath(): string {
    return join(getDataRootPath(), "armya.db")
}

function getAttachmentsPath(): string {
    return join(getDataRootPath(), "attachments")
}

function computeChecksum(filePath: string): string {
    const content = readFileSync(filePath)
    return createHash("sha256").update(content).digest("hex")
}

export function registerBackupHandlers(): void {
    ipcMain.handle("backup:create", () => {
        try {
            const backupsDir = getBackupsDir()
            if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true })

            const date = new Date().toISOString().split("T")[0]
            const zipPath = join(backupsDir, `armya-backup-${date}.zip`)

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
            zip.writeZip(zipPath)

            pruneOldBackups(backupsDir, 10)

            return { success: true, data: zipPath }
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

            zip.extractAllTo(getDataRootPath(), true)
            return { success: true, data: manifest }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })
}

function pruneOldBackups(dir: string, keep: number): void {
    const files = readdirSync(dir)
        .filter((f) => f.endsWith(".zip"))
        .map((f) => ({ name: f, mtime: statSync(join(dir, f)).mtime.getTime() }))
        .sort((a, b) => b.mtime - a.mtime)

    files.slice(keep).forEach((f) => unlinkSync(join(dir, f.name)))
}
