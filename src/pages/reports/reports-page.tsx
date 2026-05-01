import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { FileText, FileSpreadsheet } from "lucide-react"
import { useAtomValue } from "jotai"
import { profileAtom } from "../../store/profileAtom"
import { clientsAtom } from "../../store/clientsAtom"
import { formatDate, cn } from "../../lib/utils"
import type { Expense, ExpenseCategory, PaymentReport } from "../../types/definitions"

const CATEGORIES: ExpenseCategory[] = [
    "office_supplies", "telecom", "transport", "training", "equipment",
    "business_meals", "home_office", "software", "hosting", "domains",
    "api_credits", "other",
]

function getAvailableYears(): number[] {
    const current = new Date().getFullYear()
    return [current, current - 1, current - 2]
}

export function ReportsPage(): JSX.Element {
    const { t } = useTranslation()
    const profile = useAtomValue(profileAtom)
    const clients = useAtomValue(clientsAtom)
    const locale = profile?.locale ?? "fr-CA"

    const [year, setYear] = useState(new Date().getFullYear())
    const [yearPayments, setYearPayments] = useState<PaymentReport[]>([])
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [loading, setLoading] = useState(true)
    const [exportMsg, setExportMsg] = useState("")
    const [exporting, setExporting] = useState(false)

    const clientMap = new Map(clients.map((c) => [c.id, c]))

    useEffect(() => {
        async function load(): Promise<void> {
            setLoading(true)
            const [payRes, expRes] = await Promise.all([
                window.api.getPaymentsByYear(year),
                window.api.getExpenses({ year }),
            ])
            if (payRes.success && payRes.data) setYearPayments(payRes.data as PaymentReport[])
            if (expRes.success && expRes.data) setExpenses(expRes.data as Expense[])
            setLoading(false)
        }
        load()
    }, [year])

    const fmt = (n: number): string =>
        locale.startsWith("en") ? `$${n.toFixed(2)}` : `${n.toFixed(2).replace(".", ",")} $`

    // Cash received per invoice (group payments by invoice)
    const byInvoice = new Map<number, { number: string; clientId: number; issueDate: string; received: number }>()
    for (const p of yearPayments) {
        const entry = byInvoice.get(p.invoiceId) ?? { number: p.invoiceNumber, clientId: p.clientId, issueDate: p.issueDate, received: 0 }
        entry.received += p.amount
        byInvoice.set(p.invoiceId, entry)
    }
    const invoiceRevenues = [...byInvoice.values()]
    const totalRevenue = yearPayments.reduce((sum, p) => sum + p.amount, 0)

    // Expenses by category
    const byCategory = CATEGORIES.reduce<Record<string, { amount: number; deductible: number }>>((acc, cat) => {
        const catExpenses = expenses.filter((e) => e.category === cat)
        if (catExpenses.length === 0) return acc
        acc[cat] = {
            amount: catExpenses.reduce((s, e) => s + e.amount, 0),
            deductible: catExpenses.reduce((s, e) => s + e.amount * e.deductibleRate, 0),
        }
        return acc
    }, {})

    const totalDeductible = Object.values(byCategory).reduce((s, r) => s + r.deductible, 0)
    const totalGst = expenses.reduce((s, e) => s + e.gstPaid, 0)
    const totalQst = expenses.reduce((s, e) => s + e.qstPaid, 0)
    const taxableIncome = Math.max(0, totalRevenue - totalDeductible)

    async function handleExport(type: "csv" | "pdf"): Promise<void> {
        setExporting(true)
        setExportMsg("")
        const result = type === "csv"
            ? await window.api.exportReportCsv(year)
            : await window.api.exportReportPdf(year)
        setExporting(false)
        if (result.success) {
            setExportMsg(t("reports.exportSuccess"))
            setTimeout(() => setExportMsg(""), 3000)
        } else if (result.error !== "cancelled") {
            setExportMsg(t("reports.exportError"))
        }
    }

    return (
        <div className="flex h-full flex-col overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-8 py-5">
                <div>
                    <h2 className="text-2xl font-semibold">{t("reports.title")}</h2>
                    <p className="text-muted-foreground mt-0.5 text-sm">{t("reports.annualReport")}</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    >
                        {getAvailableYears().map((y) => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => handleExport("csv")}
                        disabled={exporting}
                        className="border-input bg-background hover:bg-muted/50 inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm disabled:opacity-50"
                    >
                        <FileSpreadsheet className="h-4 w-4" />
                        {t("reports.exportCsv")}
                    </button>
                    <button
                        onClick={() => handleExport("pdf")}
                        disabled={exporting}
                        className="border-input bg-background hover:bg-muted/50 inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm disabled:opacity-50"
                    >
                        <FileText className="h-4 w-4" />
                        {t("reports.exportPdf")}
                    </button>
                    {exportMsg ? (
                        <span className="text-muted-foreground text-sm">{exportMsg}</span>
                    ) : null}
                </div>
            </div>

            {loading ? (
                <div className="p-8">
                    <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
                </div>
            ) : (
                <div className="space-y-8 px-8 py-6">
                    {/* Revenue table */}
                    <section>
                        <h3 className="mb-3 border-b pb-2 text-sm font-semibold">
                            {t("reports.totalRevenue")} — {year}
                        </h3>
                        {invoiceRevenues.length === 0 ? (
                            <p className="text-muted-foreground text-sm">{t("reports.noRevenue")}</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left">
                                        <th className="pb-2 pr-4 font-medium text-muted-foreground">{t("reports.invoiceNumber")}</th>
                                        <th className="pb-2 pr-4 font-medium text-muted-foreground">{t("reports.client")}</th>
                                        <th className="pb-2 pr-4 font-medium text-muted-foreground">{t("reports.date")}</th>
                                        <th className="pb-2 text-right font-medium text-muted-foreground">{t("reports.amount")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {invoiceRevenues.map((inv) => {
                                        const client = clientMap.get(inv.clientId)
                                        return (
                                            <tr key={inv.number} className="hover:bg-muted/30">
                                                <td className="py-2 pr-4 font-mono text-xs">{inv.number}</td>
                                                <td className="py-2 pr-4">{client?.companyName ?? client?.name ?? "—"}</td>
                                                <td className="py-2 pr-4 tabular-nums">{formatDate(inv.issueDate, locale)}</td>
                                                <td className="py-2 text-right tabular-nums">{fmt(inv.received)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2">
                                        <td colSpan={3} className="pt-3 font-semibold">{t("reports.totalRevenue")}</td>
                                        <td className="pt-3 text-right font-semibold tabular-nums">{fmt(totalRevenue)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </section>

                    {/* Expenses by category */}
                    <section>
                        <h3 className="mb-3 border-b pb-2 text-sm font-semibold">
                            {t("reports.deductibleExpenses")} — {year}
                        </h3>
                        {Object.keys(byCategory).length === 0 ? (
                            <p className="text-muted-foreground text-sm">{t("reports.noExpenses")}</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left">
                                        <th className="pb-2 pr-4 font-medium text-muted-foreground">{t("reports.category")}</th>
                                        <th className="pb-2 pr-4 text-right font-medium text-muted-foreground">{t("reports.amount")}</th>
                                        <th className="pb-2 text-right font-medium text-muted-foreground">{t("reports.deductibleAmount")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {CATEGORIES.filter((cat) => byCategory[cat]).map((cat) => {
                                        const row = byCategory[cat]
                                        return (
                                            <tr key={cat} className="hover:bg-muted/30">
                                                <td className="py-2 pr-4">
                                                    <span className={cn(
                                                        "inline-block rounded px-2 py-0.5 text-xs font-medium",
                                                        cat === "business_meals"
                                                            ? "bg-amber-100 text-amber-800"
                                                            : "bg-muted text-muted-foreground"
                                                    )}>
                                                        {t(`expenses.categories.${cat}`)}
                                                    </span>
                                                </td>
                                                <td className="py-2 pr-4 text-right tabular-nums">{fmt(row.amount)}</td>
                                                <td className="py-2 text-right tabular-nums">
                                                    {row.deductible < row.amount ? (
                                                        <span className="text-amber-700">{fmt(row.deductible)}</span>
                                                    ) : (
                                                        fmt(row.deductible)
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2">
                                        <td className="pt-3 font-semibold">{t("reports.totalDeductible")}</td>
                                        <td />
                                        <td className="pt-3 text-right font-semibold tabular-nums">{fmt(totalDeductible)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </section>

                    {/* Summary */}
                    <section>
                        <h3 className="mb-3 border-b pb-2 text-sm font-semibold">{t("reports.summary")}</h3>
                        <div className="max-w-sm rounded-lg border p-5 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t("reports.totalRevenue")}</span>
                                <span className="tabular-nums font-medium">{fmt(totalRevenue)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t("reports.ytdDeductible")}</span>
                                <span className="tabular-nums text-muted-foreground">− {fmt(totalDeductible)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2 font-semibold">
                                <span>{t("reports.taxableIncome")}</span>
                                <span className="tabular-nums">{fmt(taxableIncome)}</span>
                            </div>
                            {(totalGst > 0 || totalQst > 0) ? (
                                <>
                                    <div className="flex justify-between pt-2 text-muted-foreground border-t">
                                        <span>{t("reports.gstPaid")}</span>
                                        <span className="tabular-nums">{fmt(totalGst)}</span>
                                    </div>
                                    <div className="flex justify-between text-muted-foreground">
                                        <span>{t("reports.qstPaid")}</span>
                                        <span className="tabular-nums">{fmt(totalQst)}</span>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </section>
                </div>
            )}
        </div>
    )
}
