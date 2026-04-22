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
