import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, locale: string): string {
    if (locale === "fr-CA") {
        return `${amount.toFixed(2).replace(".", ",")} $`
    }
    return `$${amount.toFixed(2)}`
}

export function formatDate(dateStr: string, locale: string): string {
    if (!dateStr) return ""
    const [year, month, day] = dateStr.split("-")
    if (locale === "fr-CA") return `${day}/${month}/${year}`
    return `${month}/${day}/${year}`
}

export function toIsoDate(date: Date): string {
    return date.toISOString().split("T")[0]
}

export function maskPostalCode(raw: string): string {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
    return clean.length > 3 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean
}

export function daysSince(dateStr: string): number {
    const [y, m, d] = dateStr.split("-").map(Number)
    const then = new Date(y, m - 1, d)
    return Math.floor((Date.now() - then.getTime()) / 86400000)
}

export function isOverdue(
    invoice: { dueDate: string | null; status: string; issueDate: string },
    lateAlertDays = 30
): boolean {
    if (invoice.status !== "sent") return false
    if (invoice.dueDate) return new Date(invoice.dueDate) < new Date()
    return daysSince(invoice.issueDate) > lateAlertDays
}
