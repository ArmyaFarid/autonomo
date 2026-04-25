import { existsSync } from "fs"
import { join, extname, basename } from "path"

export function buildSlug(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
}

export function resolveDestPath(dir: string, fileName: string): string {
    const ext = extname(fileName)
    const base = basename(fileName, ext)
    let candidate = join(dir, fileName)
    let counter = 2
    while (existsSync(candidate)) {
        candidate = join(dir, `${base}_${counter}${ext}`)
        counter++
    }
    return candidate
}
