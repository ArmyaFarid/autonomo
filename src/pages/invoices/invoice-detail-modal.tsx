import { useState } from "react"
import { useTranslation } from "react-i18next"
import { X, FileDown, ExternalLink, CheckCircle, DollarSign, Paperclip, Pencil, RotateCcw, XCircle, Ban } from "lucide-react"
import { useAtomValue } from "jotai"
import { clientsAtom } from "../../store/clientsAtom"
import { profileAtom } from "../../store/profileAtom"
import { formatDate, formatCurrency, cn } from "../../lib/utils"
import type { Invoice, FreeformLine, WeekEntry } from "../../types/definitions"

interface InvoiceDetailModalProps {
    invoice: Invoice
    onClose: () => void
    onUpdated: (updated: Invoice) => void
    onEdit: (invoice: Invoice) => void
}

const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    overdue: "bg-red-100 text-red-700",
    refused: "bg-orange-100 text-orange-700",
    cancelled: "bg-gray-200 text-gray-500",
}

export function InvoiceDetailModal({ invoice, onClose, onUpdated, onEdit }: InvoiceDetailModalProps): JSX.Element {
    const { t } = useTranslation()
    const clients = useAtomValue(clientsAtom)
    const profile = useAtomValue(profileAtom)
    const locale = profile?.locale ?? "fr-CA"

    const [pdfLoading, setPdfLoading] = useState(false)
    const [pdfMsg, setPdfMsg] = useState("")
    const [statusLoading, setStatusLoading] = useState(false)
    const [error, setError] = useState("")

    const client = clients.find((c) => c.id === invoice.clientId)
    const isFreeform = (invoice.invoiceType ?? "weekly") === "freeform"
    const freeformRows: FreeformLine[] = isFreeform && invoice.additionalLines
        ? JSON.parse(invoice.additionalLines)
        : []
    const weeklyWeeks: WeekEntry[] = !isFreeform && invoice.additionalLines
        ? JSON.parse(invoice.additionalLines)
        : []

    const statusLabel = (s: string): string => ({
        draft: t("invoices.statusDraft"),
        sent: t("invoices.statusSent"),
        paid: t("invoices.statusPaid"),
        overdue: t("invoices.statusOverdue"),
        refused: t("invoices.statusRefused"),
        cancelled: t("invoices.statusCancelled"),
    }[s] ?? s)

    async function refreshInvoice(): Promise<Invoice | null> {
        const res = await window.api.getInvoice(invoice.id)
        if (res.success && res.data) { onUpdated(res.data as Invoice); return res.data as Invoice }
        return null
    }

    async function handleGeneratePdf(): Promise<void> {
        setPdfLoading(true)
        setPdfMsg("")
        setError("")
        const result = await window.api.generateInvoicePdf(invoice.id)
        if (result.success) {
            setPdfMsg(t("invoices.pdfSuccess"))
            await refreshInvoice()
        } else {
            setError(result.error === "paid" ? t("invoices.pdfPaidError") : (result.error ?? t("invoices.pdfError")))
        }
        setPdfLoading(false)
    }

    async function handleOpenPdf(): Promise<void> {
        if (!invoice.pdfPath) return
        const result = await window.api.openPath(invoice.pdfPath)
        if (!result.success) setError(result.error ?? t("common.error"))
    }

    async function handleStatusChange(status: string, confirmKey: string): Promise<void> {
        if (!confirm(t(confirmKey))) return
        setStatusLoading(true)
        setError("")
        const result = await window.api.updateInvoiceStatus(invoice.id, status)
        if (result.success) { await refreshInvoice() }
        else setError(result.error ?? t("common.error"))
        setStatusLoading(false)
    }

    async function handleReopen(): Promise<void> {
        if (!confirm(t("invoices.confirmReopen"))) return
        setStatusLoading(true)
        setError("")
        const result = await window.api.reopenInvoice(invoice.id)
        if (result.success && result.data) {
            onEdit(result.data as Invoice)
        } else {
            setError(result.error ?? t("common.error"))
            setStatusLoading(false)
        }
    }

    async function handleAttachProof(): Promise<void> {
        const result = await window.api.openFileDialog({
            filters: [{ name: "Documents", extensions: ["pdf", "png", "jpg", "jpeg", "xlsx", "xls"] }],
            properties: ["openFile"],
        })
        if (!result.success || !result.data) return
        setError("")
        const saveResult = await window.api.addInvoiceAttachment({
            invoiceId: invoice.id,
            sourcePath: result.data[0],
            type: "hours_proof",
        })
        if (!saveResult.success) setError(saveResult.error ?? t("common.error"))
    }

    const { status } = invoice
    const locked = status === "paid" || status === "cancelled"

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background flex h-[85vh] w-full max-w-2xl flex-col rounded-lg shadow-lg">

                {/* Header */}
                <div className="flex items-center justify-between border-b px-6 py-4">
                    <div className="flex items-center gap-3">
                        <h3 className="font-mono text-lg font-semibold">{invoice.number}</h3>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[status])}>
                            {statusLabel(status)}
                        </span>
                        <span className="text-muted-foreground rounded border px-2 py-0.5 text-xs">
                            {isFreeform ? t("invoices.typeFreeform") : t("invoices.typeWeekly")}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    <Row label={t("invoices.client")}>{client?.companyName ?? client?.name ?? "—"}</Row>
                    <Row label={t("invoices.issueDate")}>{formatDate(invoice.issueDate, locale)}</Row>

                    {/* Period + hours */}
                    <div className="rounded-md border p-4 space-y-2 bg-muted/30">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("invoices.periodStart")} → {t("invoices.periodEnd")}
                        </p>
                        <p className="font-medium">
                            {formatDate(invoice.periodStart, locale)} → {formatDate(invoice.periodEnd, locale)}
                        </p>

                        {isFreeform ? (
                            <Row label={t("invoices.totalHours")}>
                                <span className="font-semibold">{invoice.totalHours} h</span>
                            </Row>
                        ) : weeklyWeeks.length > 0 ? (
                            <div className="space-y-2 pt-1 text-sm">
                                {weeklyWeeks.map((week, i) => (
                                    <div key={i} className="flex justify-between">
                                        <span className="text-muted-foreground">
                                            {t("invoices.weekLabel")} {i + 1}
                                            <span className="ml-2 text-xs">
                                                ({formatDate(week.start, locale)} – {formatDate(week.end, locale)})
                                            </span>
                                        </span>
                                        <span className="font-medium">{week.hours} h</span>
                                    </div>
                                ))}
                                <div className="flex justify-between border-t pt-1 font-semibold">
                                    <span>{t("invoices.totalHours")}</span>
                                    <span>{invoice.totalHours} h</span>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-4 pt-1 text-sm">
                                <div>
                                    <p className="text-muted-foreground">{t("invoices.hoursWeek1")}</p>
                                    <p className="font-medium">{invoice.hoursWeek1} h</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">{t("invoices.hoursWeek2")}</p>
                                    <p className="font-medium">{invoice.hoursWeek2} h</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">{t("invoices.totalHours")}</p>
                                    <p className="font-semibold">{invoice.totalHours} h</p>
                                </div>
                            </div>
                        )}

                        <Row label={t("invoices.hourlyRate")}>
                            {formatCurrency(invoice.hourlyRate, locale)} / h
                        </Row>
                    </div>

                    {/* Freeform rows */}
                    {isFreeform ? (
                        <div className="space-y-2">
                            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                                {t("invoices.freeformRows")}
                            </p>
                            <div className="rounded-md border overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/30">
                                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t("invoices.rowDescription")}</th>
                                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("invoices.rowRate")}</th>
                                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("invoices.rowQty")}</th>
                                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("invoices.rowAmount")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {freeformRows.map((row, i) => (
                                            <tr key={i} className="border-b last:border-0">
                                                <td className="px-3 py-2">{row.description}</td>
                                                <td className="px-3 py-2 text-right">{formatCurrency(row.rate, locale)}</td>
                                                <td className="px-3 py-2 text-right">{row.qty}</td>
                                                <td className="px-3 py-2 text-right font-medium">{formatCurrency(row.amount, locale)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : null}

                    {/* Description — always shown */}
                    {invoice.description ? (
                        <div className="space-y-1 text-sm">
                            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                                {t("invoices.description")}
                            </p>
                            <p className="whitespace-pre-line">{invoice.description}</p>
                        </div>
                    ) : null}

                    {/* Totals */}
                    <div className="space-y-1 text-sm border-t pt-4">
                        <AmountRow label={t("invoices.subtotal")} value={formatCurrency(invoice.subtotal, locale)} />
                        {invoice.gstAmount > 0 ? (
                            <AmountRow label={t("invoices.gst")} value={formatCurrency(invoice.gstAmount, locale)} />
                        ) : null}
                        {invoice.qstAmount > 0 ? (
                            <AmountRow label={t("invoices.qst")} value={formatCurrency(invoice.qstAmount, locale)} />
                        ) : null}
                        <AmountRow label={t("invoices.total")} value={formatCurrency(invoice.total, locale)} bold />
                    </div>

                    {invoice.notes ? (
                        <div>
                            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{t("invoices.notes")}</p>
                            <p className="mt-1 text-sm">{invoice.notes}</p>
                        </div>
                    ) : null}

                    {error ? <p className="text-destructive text-sm">{error}</p> : null}
                    {pdfMsg ? <p className="text-sm text-green-600">{pdfMsg}</p> : null}
                </div>

                {/* Actions */}
                <div className="border-t px-6 py-4">
                    <div className="flex flex-wrap gap-2">

                        {/* Edit — draft only */}
                        {status === "draft" ? (
                            <button
                                onClick={() => onEdit(invoice)}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium"
                            >
                                <Pencil className="h-4 w-4" />
                                {t("invoices.edit")}
                            </button>
                        ) : null}

                        {/* Generate PDF — not for paid */}
                        {status !== "paid" && !locked ? (
                            <button
                                onClick={handleGeneratePdf}
                                disabled={pdfLoading}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50"
                            >
                                <FileDown className="h-4 w-4" />
                                {pdfLoading ? t("invoices.pdfGenerating") : t("invoices.generatePdf")}
                            </button>
                        ) : null}

                        {/* Open existing PDF */}
                        {invoice.pdfPath ? (
                            <button
                                onClick={handleOpenPdf}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium"
                            >
                                <ExternalLink className="h-4 w-4" />
                                {t("invoices.openPdf")}
                            </button>
                        ) : null}

                        {/* Attach proof — not for paid/cancelled */}
                        {!locked ? (
                            <button
                                onClick={handleAttachProof}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium"
                            >
                                <Paperclip className="h-4 w-4" />
                                {t("invoices.attachProof")}
                            </button>
                        ) : null}

                        {/* Mark sent — draft or overdue */}
                        {(status === "draft" || status === "overdue") ? (
                            <button
                                onClick={() => handleStatusChange("sent", "invoices.confirmSent")}
                                disabled={statusLoading}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50"
                            >
                                <CheckCircle className="h-4 w-4" />
                                {t("invoices.markSent")}
                            </button>
                        ) : null}

                        {/* Mark paid — sent or overdue */}
                        {(status === "sent" || status === "overdue") ? (
                            <button
                                onClick={() => handleStatusChange("paid", "invoices.confirmPaid")}
                                disabled={statusLoading}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-50"
                            >
                                <DollarSign className="h-4 w-4" />
                                {t("invoices.markPaid")}
                            </button>
                        ) : null}

                        {/* Mark refused — sent or overdue */}
                        {(status === "sent" || status === "overdue") ? (
                            <button
                                onClick={() => handleStatusChange("refused", "invoices.confirmRefused")}
                                disabled={statusLoading}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50"
                            >
                                <XCircle className="h-4 w-4" />
                                {t("invoices.markRefused")}
                            </button>
                        ) : null}

                        {/* Reopen — refused only → back to draft + opens edit */}
                        {status === "refused" ? (
                            <button
                                onClick={handleReopen}
                                disabled={statusLoading}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50"
                            >
                                <RotateCcw className="h-4 w-4" />
                                {t("invoices.reopen")}
                            </button>
                        ) : null}

                        {/* Cancel — anything except paid/cancelled */}
                        {!locked ? (
                            <button
                                onClick={() => handleStatusChange("cancelled", "invoices.confirmCancelled")}
                                disabled={statusLoading}
                                className="border-input hover:bg-destructive/10 hover:text-destructive hover:border-destructive inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium text-muted-foreground disabled:opacity-50"
                            >
                                <Ban className="h-4 w-4" />
                                {t("invoices.markCancelled")}
                            </button>
                        ) : null}

                    </div>
                </div>
            </div>
        </div>
    )
}

interface RowProps { label: string; children: React.ReactNode }
const Row: React.FC<RowProps> = ({ label, children }) => (
    <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span>{children}</span>
    </div>
)

interface AmountRowProps { label: string; value: string; bold?: boolean }
const AmountRow: React.FC<AmountRowProps> = ({ label, value, bold }) => (
    <div className={cn("flex justify-between", bold && "border-t pt-1 font-semibold text-base")}>
        <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
        <span>{value}</span>
    </div>
)
