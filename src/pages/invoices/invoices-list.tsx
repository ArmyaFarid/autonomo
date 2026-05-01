import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, FileText, Upload } from "lucide-react"
import { useAtom } from "jotai"
import { invoicesAtom } from "../../store/invoicesAtom"
import { clientsAtom } from "../../store/clientsAtom"
import { cn, formatDate, formatCurrency, isOverdue } from "../../lib/utils"
import { useAtomValue } from "jotai"
import { profileAtom } from "../../store/profileAtom"
import { computePaymentStatus } from "../../types/definitions"
import type { Invoice, Client, ComputedPaymentStatus } from "../../types/definitions"

interface InvoicesListProps {
    refreshKey: number
    onNew: () => void
    onImport: () => void
    onSelect: (invoice: Invoice) => void
}

const STATUS_COLORS: Record<ComputedPaymentStatus, string> = {
    draft: "bg-gray-100 text-gray-600",
    unpaid: "bg-blue-100 text-blue-700",
    partial: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    credited: "bg-violet-100 text-violet-700",
    voided: "bg-gray-200 text-gray-500",
}

export function InvoicesList({ refreshKey, onNew, onImport, onSelect }: InvoicesListProps): JSX.Element {
    const { t } = useTranslation()
    const [invoices, setInvoices] = useAtom(invoicesAtom)
    const clients = useAtomValue(clientsAtom)
    const profile = useAtomValue(profileAtom)
    const locale = profile?.locale ?? "fr-CA"

    const [loading, setLoading] = useState(true)
    const [filterStatus, setFilterStatus] = useState("")
    const [filterYear, setFilterYear] = useState("")
    const [filterClientId, setFilterClientId] = useState("")

    async function load(): Promise<void> {
        setLoading(true)
        const result = await window.api.getInvoices()
        if (result.success && result.data) {
            setInvoices(result.data as Invoice[])
        }
        setLoading(false)
    }

    useEffect(() => {
        load()
    }, [refreshKey])

    const clientMap = new Map<number, Client>(clients.map((c) => [c.id, c]))

    const years = [...new Set(invoices.map((i) => i.issueDate.slice(0, 4)))].sort().reverse()

    const payStatus = (inv: Invoice): ComputedPaymentStatus =>
        computePaymentStatus(inv, inv.totalPaid ?? 0, inv.totalCredit ?? 0)

    const visible = invoices.filter((inv) => {
        const lateThreshold = profile?.lateInvoiceAlertDays ?? 30
        if (filterStatus === "overdue") {
            if (!isOverdue(inv, lateThreshold)) return false
        } else if (filterStatus) {
            if (payStatus(inv) !== filterStatus) return false
        }
        if (filterYear && !inv.issueDate.startsWith(filterYear)) return false
        if (filterClientId && inv.clientId !== Number(filterClientId)) return false
        return true
    })

    const statusLabel = (s: ComputedPaymentStatus): string => ({
        draft: t("invoices.statusDraft"),
        unpaid: t("invoices.statusUnpaid"),
        partial: t("invoices.statusPartial"),
        paid: t("invoices.statusPaid"),
        credited: t("invoices.statusCredited"),
        voided: t("invoices.statusVoided"),
    }[s] ?? s)

    return (
        <div className="p-8">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold">{t("invoices.title")}</h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {invoices.length} facture{invoices.length !== 1 ? "s" : ""}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onImport}
                        className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm font-medium"
                    >
                        <Upload className="h-4 w-4" />
                        {t("invoices.import")}
                    </button>
                    <button
                        onClick={onNew}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium"
                    >
                        <Plus className="h-4 w-4" />
                        {t("invoices.new")}
                    </button>
                </div>
            </div>

            <div className="mb-4 flex gap-3">
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className={selectCn}
                >
                    <option value="">{t("invoices.filterAll")}</option>
                    <option value="draft">{t("invoices.statusDraft")}</option>
                    <option value="unpaid">{t("invoices.statusUnpaid")}</option>
                    <option value="overdue">{t("invoices.statusOverdue")}</option>
                    <option value="partial">{t("invoices.statusPartial")}</option>
                    <option value="paid">{t("invoices.statusPaid")}</option>
                    <option value="credited">{t("invoices.statusCredited")}</option>
                    <option value="voided">{t("invoices.statusVoided")}</option>
                </select>

                <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className={selectCn}
                >
                    <option value="">{t("invoices.filterYear")}</option>
                    {years.map((y) => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>

                <select
                    value={filterClientId}
                    onChange={(e) => setFilterClientId(e.target.value)}
                    className={selectCn}
                >
                    <option value="">{t("invoices.client")}</option>
                    {clients.filter((c) => c.active === 1).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
            ) : visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <FileText className="text-muted-foreground mb-4 h-12 w-12" />
                    <p className="text-muted-foreground text-sm">{t("invoices.noInvoices")}</p>
                    <button
                        onClick={onNew}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4 inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium"
                    >
                        <Plus className="h-4 w-4" />
                        {t("invoices.new")}
                    </button>
                </div>
            ) : (
                <div className="rounded-md border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50">
                                <th className="px-4 py-3 text-left font-medium">{t("invoices.number")}</th>
                                <th className="px-4 py-3 text-left font-medium">{t("invoices.client")}</th>
                                <th className="px-4 py-3 text-left font-medium">{t("invoices.issueDate")}</th>
                                <th className="px-4 py-3 text-left font-medium">{t("invoices.periodStart")} → {t("invoices.periodEnd")}</th>
                                <th className="px-4 py-3 text-right font-medium">{t("invoices.total")}</th>
                                <th className="px-4 py-3 text-left font-medium">{t("invoices.status")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((inv) => {
                                const client = clientMap.get(inv.clientId)
                                return (
                                    <tr
                                        key={inv.id}
                                        className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                                        onClick={() => onSelect(inv)}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-medium">{inv.number}</span>
                                                {inv.invoiceType === "imported" ? (
                                                    <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                                                        {t("invoices.typeImported")}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">{client?.companyName ?? client?.name ?? "—"}</td>
                                        <td className="text-muted-foreground px-4 py-3">{formatDate(inv.issueDate, locale)}</td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {formatDate(inv.periodStart, locale)} → {formatDate(inv.periodEnd, locale)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium">
                                            {formatCurrency(inv.total, locale)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[payStatus(inv)])}>
                                                    {statusLabel(payStatus(inv))}
                                                </span>
                                                {isOverdue(inv, profile?.lateInvoiceAlertDays ?? 30) ? (
                                                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                                        {t("invoices.statusOverdue")}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

const selectCn =
    "border-input bg-background ring-offset-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
