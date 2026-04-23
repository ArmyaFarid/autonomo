import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Clock, TrendingUp, Receipt } from "lucide-react"
import { useAtomValue } from "jotai"
import { profileAtom } from "../../store/profileAtom"
import { formatDate, cn } from "../../lib/utils"
import type { Invoice, Expense } from "../../types/definitions"

export function DashboardPage(): JSX.Element {
    const { t } = useTranslation()
    const profile = useAtomValue(profileAtom)
    const locale = profile?.locale ?? "fr-CA"
    const taxReserveRate = profile?.taxReserveRate ?? 0.20

    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1

    const [invoices, setInvoices] = useState<Invoice[]>([])
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load(): Promise<void> {
            const [invRes, expRes] = await Promise.all([
                window.api.getInvoices({ year: currentYear }),
                window.api.getExpenses({ year: currentYear }),
            ])
            if (invRes.success && invRes.data) setInvoices(invRes.data as Invoice[])
            if (expRes.success && expRes.data) setExpenses(expRes.data as Expense[])
            setLoading(false)
        }
        load()
    }, [])

    const fmt = (n: number): string =>
        locale.startsWith("en") ? `$${n.toFixed(2)}` : `${n.toFixed(2).replace(".", ",")} $`

    // Month metrics
    const monthPaid = invoices
        .filter((inv) => inv.status === "paid" && getMonth(inv.issueDate) === currentMonth)
        .reduce((sum, inv) => sum + inv.total, 0)

    const monthExpenses = expenses
        .filter((e) => getMonth(e.date) === currentMonth)
        .reduce((sum, e) => sum + e.amount, 0)

    const pendingInvoices = invoices.filter((inv) => inv.status === "sent")
    const pendingAmount = pendingInvoices.reduce((sum, inv) => sum + inv.total, 0)

    const overdueInvoices = invoices.filter((inv) => {
        if (inv.status !== "sent" && inv.status !== "overdue") return false
        const daysOld = daysSince(inv.issueDate)
        return daysOld > (profile?.lateInvoiceAlertDays ?? 30)
    })

    // Annual metrics
    const ytdRevenue = invoices
        .filter((inv) => inv.status === "paid")
        .reduce((sum, inv) => sum + inv.total, 0)

    const ytdTotalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)

    const ytdDeductible = expenses.reduce((sum, e) => sum + e.amount * e.deductibleRate, 0)

    const taxableIncome = Math.max(0, ytdRevenue - ytdDeductible)
    const taxReserve = taxableIncome * taxReserveRate
    const spendable = ytdRevenue - ytdTotalExpenses - taxReserve

    if (loading) {
        return (
            <div className="p-8">
                <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col overflow-auto">
            <div className="border-b px-8 py-5">
                <h2 className="text-2xl font-semibold">{t("dashboard.title")}</h2>
            </div>

            <div className="space-y-8 px-8 py-6">
                {/* Month cards */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <StatCard
                        icon={<TrendingUp className="h-5 w-5" />}
                        label={t("dashboard.monthRevenue")}
                        value={fmt(monthPaid)}
                        color="green"
                    />
                    <StatCard
                        icon={<Clock className="h-5 w-5" />}
                        label={t("dashboard.pendingInvoices")}
                        value={fmt(pendingAmount)}
                        sub={pendingInvoices.length > 0
                            ? `${pendingInvoices.length} facture(s)`
                            : t("dashboard.noPending")}
                        color="blue"
                    />
                    <StatCard
                        icon={<AlertTriangle className="h-5 w-5" />}
                        label={t("dashboard.overdueInvoices")}
                        value={overdueInvoices.length > 0
                            ? t("dashboard.overdueAlert", { count: overdueInvoices.length })
                            : t("dashboard.noOverdue")}
                        color={overdueInvoices.length > 0 ? "red" : "gray"}
                        isText
                    />
                    <StatCard
                        icon={<Receipt className="h-5 w-5" />}
                        label={t("dashboard.monthExpenses")}
                        value={fmt(monthExpenses)}
                        color="gray"
                    />
                </div>

                {/* Overdue list */}
                {overdueInvoices.length > 0 ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                        <p className="mb-2 text-sm font-semibold text-red-800">
                            {t("dashboard.overdueAlert", { count: overdueInvoices.length })}
                        </p>
                        <div className="space-y-1">
                            {overdueInvoices.map((inv) => (
                                <div key={inv.id} className="flex justify-between text-sm text-red-700">
                                    <span>{inv.number} — {formatDate(inv.issueDate, locale)}</span>
                                    <span className="font-medium">{fmt(inv.total)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {/* Annual summary */}
                <div>
                    <h3 className="mb-4 text-base font-semibold">
                        {t("dashboard.annualSummary", { year: currentYear })}
                    </h3>
                    <div className="rounded-lg border p-6">
                        <div className="space-y-3">
                            <SummaryRow
                                label={t("dashboard.ytdRevenue")}
                                value={fmt(ytdRevenue)}
                                bold
                            />
                            <SummaryRow
                                label={t("dashboard.ytdDeductible")}
                                value={`− ${fmt(ytdDeductible)}`}
                                muted
                            />
                            <div className="border-t pt-3">
                                <SummaryRow
                                    label={t("dashboard.taxableIncome")}
                                    value={fmt(taxableIncome)}
                                    bold
                                />
                            </div>
                            <SummaryRow
                                label={t("dashboard.taxReserve", { rate: Math.round(taxReserveRate * 100) })}
                                value={`− ${fmt(taxReserve)}`}
                                color="amber"
                            />
                            <div className="border-t pt-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-base font-bold">{t("dashboard.spendableIncome")}</p>
                                        <p className="text-muted-foreground text-xs">{t("dashboard.spendableDesc")}</p>
                                    </div>
                                    <p className={cn(
                                        "text-2xl font-bold tabular-nums",
                                        spendable >= 0 ? "text-green-600" : "text-red-600"
                                    )}>
                                        {fmt(spendable)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function getMonth(dateStr: string): number {
    return parseInt(dateStr.split("-")[1], 10)
}

function daysSince(dateStr: string): number {
    const [y, m, d] = dateStr.split("-").map(Number)
    const then = new Date(y, m - 1, d)
    return Math.floor((Date.now() - then.getTime()) / 86400000)
}

interface StatCardProps {
    icon: React.ReactNode
    label: string
    value: string
    sub?: string
    color: "green" | "blue" | "red" | "gray" | "amber"
    isText?: boolean
}

const colorMap = {
    green: "text-green-600 bg-green-50",
    blue: "text-blue-600 bg-blue-50",
    red: "text-red-600 bg-red-50",
    gray: "text-muted-foreground bg-muted",
    amber: "text-amber-600 bg-amber-50",
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, sub, color, isText }) => (
    <div className="rounded-lg border p-4">
        <div className={cn("mb-3 inline-flex rounded-md p-2", colorMap[color])}>
            {icon}
        </div>
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className={cn("mt-1 font-semibold", isText ? "text-sm" : "text-xl tabular-nums")}>
            {value}
        </p>
        {sub ? <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p> : null}
    </div>
)

interface SummaryRowProps {
    label: string
    value: string
    bold?: boolean
    muted?: boolean
    color?: "amber"
}

const SummaryRow: React.FC<SummaryRowProps> = ({ label, value, bold, muted, color }) => (
    <div className="flex items-center justify-between">
        <p className={cn(
            "text-sm",
            bold ? "font-semibold" : "",
            muted ? "text-muted-foreground" : "",
            color === "amber" ? "text-amber-700" : ""
        )}>
            {label}
        </p>
        <p className={cn(
            "tabular-nums text-sm",
            bold ? "font-semibold" : "",
            muted ? "text-muted-foreground" : "",
            color === "amber" ? "font-medium text-amber-700" : ""
        )}>
            {value}
        </p>
    </div>
)
