import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { X, FileDown, ExternalLink, CheckCircle, DollarSign, Paperclip, Pencil, RotateCcw, XCircle, Ban, Plus, Trash2 } from "lucide-react"
import { useAtomValue } from "jotai"
import { clientsAtom } from "../../store/clientsAtom"
import { profileAtom } from "../../store/profileAtom"
import { formatDate, formatCurrency, cn, isOverdue } from "../../lib/utils"
import type { Invoice, InvoiceLine, Payment, InvoiceAttachment } from "../../types/definitions"
import { PaymentFormModal } from "./payment-form-modal"
import { MarkPaidDialog } from "./mark-paid-dialog"

const EDIT_WINDOW_MS = 5 * 60 * 1000

// Persists across modal close/reopen for the current app session.
// Maps paymentId → timestamp when the edit window started (create or last edit).
const editWindowStart = new Map<number, number>()

interface InvoiceDetailModalProps {
    invoice: Invoice
    lines: InvoiceLine[]
    onClose: () => void
    onUpdated: (updated: Invoice, lines: InvoiceLine[]) => void
    onEdit: (invoice: Invoice, lines: InvoiceLine[]) => void
}

const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    overdue: "bg-red-100 text-red-700",
    refused: "bg-orange-100 text-orange-700",
    cancelled: "bg-gray-200 text-gray-500",
}

export function InvoiceDetailModal({ invoice, lines, onClose, onUpdated, onEdit }: InvoiceDetailModalProps): JSX.Element {
    const { t } = useTranslation()
    const clients = useAtomValue(clientsAtom)
    const profile = useAtomValue(profileAtom)
    const locale = profile?.locale ?? "fr-CA"

    // Local copies so status refreshes immediately after payment operations
    // without waiting for the parent re-render cycle to propagate.
    const [localInvoice, setLocalInvoice] = useState<Invoice>(invoice)
    const [localLines, setLocalLines] = useState<InvoiceLine[]>(lines)

    const [pdfLoading, setPdfLoading] = useState(false)
    const [pdfMsg, setPdfMsg] = useState("")
    const [statusLoading, setStatusLoading] = useState(false)
    const [error, setError] = useState("")

    const [attachments, setAttachments] = useState<InvoiceAttachment[]>([])
    const [paymentsData, setPaymentsData] = useState<Payment[]>([])
    const [showPaymentForm, setShowPaymentForm] = useState(false)
    const [showMarkPaid, setShowMarkPaid] = useState(false)
    const [editingPayment, setEditingPayment] = useState<Payment | null>(null)

    // Tick every second so countdown displays stay live
    const [, setTick] = useState(0)
    useEffect(() => {
        const interval = setInterval(() => setTick((n) => n + 1), 1000)
        return () => clearInterval(interval)
    }, [])

    // Sync local state when parent passes updated invoice (e.g. after status change)
    useEffect(() => {
        setLocalInvoice(invoice)
        setLocalLines(lines)
    }, [invoice.updatedAt])

    useEffect(() => {
        loadAttachments()
        loadPayments()
    }, [invoice.id])

    async function loadAttachments(): Promise<void> {
        const res = await window.api.getInvoiceAttachments(localInvoice.id)
        if (res.success && res.data) setAttachments(res.data as InvoiceAttachment[])
    }

    async function loadPayments(): Promise<void> {
        const res = await window.api.getPayments(localInvoice.id)
        if (res.success && res.data) setPaymentsData(res.data as Payment[])
    }

    // Returns seconds remaining in the edit window for a given payment.
    // Uses editWindowStart map (reset on each save/edit) with createdAt as fallback.
    function getSecondsLeft(p: Payment): number {
        const start = editWindowStart.get(p.id) ?? new Date(p.createdAt).getTime()
        return Math.max(0, Math.floor((start + EDIT_WINDOW_MS - Date.now()) / 1000))
    }

    function formatCountdown(seconds: number): string {
        const m = Math.floor(seconds / 60)
        const s = String(seconds % 60).padStart(2, "0")
        return `${m}:${s}`
    }

    const client = clients.find((c) => c.id === localInvoice.clientId)
    const isFreeform = localInvoice.invoiceType === "freeform"
    const isImported = localInvoice.invoiceType === "imported"
    const totalHours = localLines.reduce((sum, l) => sum + l.qty, 0)
    const totalPaid = paymentsData.reduce((sum, p) => sum + p.amount, 0)
    const remaining = Math.max(0, localInvoice.total - totalPaid)

    const statusLabel = (s: string): string => ({
        draft: t("invoices.statusDraft"),
        sent: t("invoices.statusSent"),
        paid: t("invoices.statusPaid"),
        overdue: t("invoices.statusOverdue"),
        refused: t("invoices.statusRefused"),
        cancelled: t("invoices.statusCancelled"),
    }[s] ?? s)

    async function refreshInvoice(): Promise<void> {
        const res = await window.api.getInvoice(localInvoice.id)
        if (res.success && res.data) {
            const { invoice: updated, lines: updatedLines } = res.data as { invoice: Invoice; lines: InvoiceLine[] }
            setLocalInvoice(updated)
            setLocalLines(updatedLines)
            onUpdated(updated, updatedLines)
        }
    }

    async function handleGeneratePdf(): Promise<void> {
        setPdfLoading(true)
        setPdfMsg("")
        setError("")
        const result = await window.api.generateInvoicePdf(localInvoice.id)
        if (result.success) {
            setPdfMsg(t("invoices.pdfSuccess"))
            await refreshInvoice()
        } else {
            setError(result.error === "paid" ? t("invoices.pdfPaidError") : (result.error ?? t("invoices.pdfError")))
        }
        setPdfLoading(false)
    }

    async function handleOpenPdf(): Promise<void> {
        if (!localInvoice.pdfPath) return
        const result = await window.api.openPath(localInvoice.pdfPath)
        if (!result.success) setError(result.error ?? t("common.error"))
    }

    async function handleStatusChange(newStatus: string, confirmKey: string): Promise<void> {
        if (!confirm(t(confirmKey))) return
        setStatusLoading(true)
        setError("")
        const result = await window.api.updateInvoiceStatus(localInvoice.id, newStatus)
        if (result.success) { await refreshInvoice() }
        else setError(result.error ?? t("common.error"))
        setStatusLoading(false)
    }

    async function handleReopen(): Promise<void> {
        if (!confirm(t("invoices.confirmReopen"))) return
        setStatusLoading(true)
        setError("")
        const result = await window.api.reopenInvoice(localInvoice.id)
        if (result.success && result.data) {
            const { invoice: updated, lines: updatedLines } = result.data as { invoice: Invoice; lines: InvoiceLine[] }
            onEdit(updated, updatedLines)
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
            invoiceId: localInvoice.id,
            sourcePath: (result.data as string[])[0],
            type: "hours_proof",
        })
        if (saveResult.success) {
            await loadAttachments()
        } else {
            setError(saveResult.error ?? t("common.error"))
        }
    }

    async function handleDeleteAttachment(id: number): Promise<void> {
        if (!confirm(t("invoices.deleteAttachment"))) return
        setError("")
        const result = await window.api.deleteInvoiceAttachment(id)
        if (result.success) {
            await loadAttachments()
        } else {
            setError(result.error ?? t("common.error"))
        }
    }

    async function handlePaymentSaved(payment: Payment): Promise<void> {
        setShowPaymentForm(false)
        setShowMarkPaid(false)
        setEditingPayment(null)
        editWindowStart.set(payment.id, Date.now())
        await loadPayments()
        await refreshInvoice()
    }

    async function handleDeletePayment(p: Payment): Promise<void> {
        if (!confirm(t("payments.confirmDelete"))) return
        const result = await window.api.deletePayment(p.id)
        if (!result.success) { setError(result.error ?? t("common.error")); return }
        editWindowStart.delete(p.id)
        await loadPayments()
        await refreshInvoice()
    }

    function openEditPayment(p: Payment): void {
        setEditingPayment(p)
        setShowPaymentForm(true)
    }

    // Derive "paid" from payments rather than trusting only the DB label.
    // If all payments cover the total, we treat the invoice as paid regardless of DB status.
    const fullyPaid = paymentsData.length > 0 && remaining <= 0.01
    const effectiveStatus = fullyPaid ? "paid" : localInvoice.status
    const status = effectiveStatus

    const overdue = isOverdue(localInvoice, profile?.lateInvoiceAlertDays ?? 30)
    const locked = status === "paid" || status === "cancelled"
    const canRecordPayment = status === "sent"
    const showPaymentsSection = status === "sent" || status === "paid"
    const pdfGenerated = !!localInvoice.pdfPath

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background flex h-[90vh] w-full max-w-2xl flex-col rounded-lg shadow-lg">

                {/* Header */}
                <div className="flex items-center justify-between border-b px-6 py-4">
                    <div className="flex items-center gap-3">
                        <h3 className="font-mono text-lg font-semibold">{localInvoice.number}</h3>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[status])}>
                            {statusLabel(status)}
                        </span>
                        <span className={cn(
                            "rounded border px-2 py-0.5 text-xs",
                            isImported
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "text-muted-foreground"
                        )}>
                            {isImported
                                ? t("invoices.typeImported")
                                : isFreeform
                                    ? t("invoices.typeFreeform")
                                    : t("invoices.typeWeekly")}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    <Row label={t("invoices.client")}>{client?.companyName ?? client?.name ?? "—"}</Row>
                    <Row label={t("invoices.issueDate")}>{formatDate(localInvoice.issueDate, locale)}</Row>
                    {localInvoice.dueDate ? (
                        <Row label={t("invoices.dueDate")}>{formatDate(localInvoice.dueDate, locale)}</Row>
                    ) : null}

                    {overdue ? (
                        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            <span className="font-medium">{t("invoices.overdueWarning")}</span>
                        </div>
                    ) : null}

                    {/* Period + lines */}
                    <div className="rounded-md border p-4 space-y-3 bg-muted/30">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("invoices.periodStart")} → {t("invoices.periodEnd")}
                        </p>
                        <p className="font-medium">
                            {formatDate(localInvoice.periodStart, locale)} → {formatDate(localInvoice.periodEnd, locale)}
                        </p>

                        {localLines.length > 0 ? (
                            <div className="rounded border overflow-hidden text-sm">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b bg-muted/40">
                                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t("invoices.rowLabel")}</th>
                                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("invoices.rowRate")}</th>
                                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("invoices.rowQty")}</th>
                                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("invoices.rowAmount")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {localLines.map((line) => (
                                            <tr key={line.id} className="border-b last:border-0">
                                                <td className="px-3 py-2">
                                                    <p className="font-medium">{line.label}</p>
                                                    {line.description ? (
                                                        <p className="text-xs text-muted-foreground">{line.description}</p>
                                                    ) : null}
                                                </td>
                                                <td className="px-3 py-2 text-right">{formatCurrency(line.unitPrice, locale)}</td>
                                                <td className="px-3 py-2 text-right">{line.qty} h</td>
                                                <td className="px-3 py-2 text-right font-medium">{formatCurrency(line.amount, locale)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}

                        <Row label={t("invoices.totalHours")}>
                            <span className="font-semibold">{totalHours} h</span>
                        </Row>
                    </div>

                    {/* Description */}
                    {localInvoice.description ? (
                        <div className="space-y-1 text-sm">
                            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                                {t("invoices.description")}
                            </p>
                            <p className="whitespace-pre-line">{localInvoice.description}</p>
                        </div>
                    ) : null}

                    {/* Totals */}
                    <div className="space-y-1 text-sm border-t pt-4">
                        <AmountRow label={t("invoices.subtotal")} value={formatCurrency(localInvoice.subtotal, locale)} />
                        {localInvoice.gstAmount > 0 ? (
                            <AmountRow label={t("invoices.gst")} value={formatCurrency(localInvoice.gstAmount, locale)} />
                        ) : null}
                        {localInvoice.qstAmount > 0 ? (
                            <AmountRow label={t("invoices.qst")} value={formatCurrency(localInvoice.qstAmount, locale)} />
                        ) : null}
                        <AmountRow label={t("invoices.total")} value={formatCurrency(localInvoice.total, locale)} bold />
                    </div>

                    {/* Payments section */}
                    {showPaymentsSection ? (
                        <div className="space-y-3 border-t pt-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold">{t("payments.title")}</h4>
                                {canRecordPayment ? (
                                    <button
                                        onClick={() => { setEditingPayment(null); setShowPaymentForm(true) }}
                                        disabled={!pdfGenerated}
                                        className="border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={!pdfGenerated ? t("invoices.noPdfForPayment") : undefined}
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        {t("payments.add")}
                                    </button>
                                ) : null}
                            </div>
                            {canRecordPayment && !pdfGenerated ? (
                                <p className="text-xs text-amber-600">{t("invoices.noPdfForPayment")}</p>
                            ) : null}

                            {paymentsData.length === 0 ? (
                                <p className="text-muted-foreground text-sm">{t("payments.noPayments")}</p>
                            ) : (
                                <div className="space-y-2">
                                    {paymentsData.map((p) => {
                                        const secondsLeft = getSecondsLeft(p)
                                        const isEditable = secondsLeft > 0
                                        return (
                                            <div key={p.id} className={cn(
                                                "flex items-center justify-between rounded-md border px-3 py-2.5 text-sm",
                                                isEditable && "border-primary/40 bg-primary/5"
                                            )}>
                                                <div>
                                                    <span className="font-medium">{formatDate(p.paymentDate, locale)}</span>
                                                    <span className="text-muted-foreground ml-2 text-xs">
                                                        {t(`payments.methods.${p.paymentMethod}`)}
                                                        {p.reference ? ` · ${p.reference}` : ""}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-green-700">{formatCurrency(p.amount, locale)}</span>
                                                    {isEditable ? (
                                                        <>
                                                            <button
                                                                onClick={() => openEditPayment(p)}
                                                                className="border-primary/50 text-primary hover:bg-primary/10 inline-flex h-7 items-center gap-1 rounded border px-2 text-xs font-medium"
                                                            >
                                                                <Pencil className="h-3 w-3" />
                                                                {t("payments.editWindow", { time: formatCountdown(secondsLeft) })}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeletePayment(p)}
                                                                className="text-muted-foreground hover:text-destructive flex h-7 w-7 items-center justify-center rounded"
                                                                title={t("payments.confirmDelete")}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </>
                                                    ) : null}
                                                </div>
                                            </div>
                                        )
                                    })}

                                    <div className="flex justify-between border-t pt-2 text-sm">
                                        <span className="text-muted-foreground">{t("payments.totalPaid")}</span>
                                        <span className="font-medium">{formatCurrency(totalPaid, locale)}</span>
                                    </div>

                                    {status !== "paid" ? (
                                        <div className="flex justify-between text-sm font-semibold">
                                            <span>{t("payments.remainingBalance")}</span>
                                            <span className="text-amber-700">{formatCurrency(remaining, locale)}</span>
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {localInvoice.notes ? (
                        <div>
                            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{t("invoices.notes")}</p>
                            <p className="mt-1 text-sm">{localInvoice.notes}</p>
                        </div>
                    ) : null}

                    {/* Attachments */}
                    <div className="space-y-2 border-t pt-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold">{t("invoices.attachments")}</h4>
                            {!locked ? (
                                <button
                                    onClick={handleAttachProof}
                                    className="border-input bg-background hover:bg-accent inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium"
                                >
                                    <Plus className="h-3 w-3" />
                                    {t("invoices.attachProof")}
                                </button>
                            ) : null}
                        </div>
                        {attachments.length === 0 ? (
                            <p className="text-muted-foreground text-sm">{t("invoices.noAttachments")}</p>
                        ) : (
                            <div className="space-y-1">
                                {attachments.map((a) => (
                                    <div key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                            <span className="truncate text-xs">{a.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                            <button
                                                onClick={() => window.api.openPath(a.path)}
                                                className="text-muted-foreground hover:text-foreground flex h-7 w-7 items-center justify-center rounded"
                                                title={t("invoices.openPdf")}
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </button>
                                            {!locked ? (
                                                <button
                                                    onClick={() => handleDeleteAttachment(a.id)}
                                                    className="text-muted-foreground hover:text-destructive flex h-7 w-7 items-center justify-center rounded"
                                                    title={t("invoices.deleteAttachment")}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {error ? <p className="text-destructive text-sm">{error}</p> : null}
                    {pdfMsg ? <p className="text-sm text-green-600">{pdfMsg}</p> : null}
                </div>

                {/* Actions */}
                <div className="border-t px-6 py-4">
                    <div className="flex flex-wrap gap-2">

                        {status === "draft" && !isImported ? (
                            <button
                                onClick={() => onEdit(localInvoice, localLines)}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium"
                            >
                                <Pencil className="h-4 w-4" />
                                {t("invoices.edit")}
                            </button>
                        ) : null}

                        {status !== "paid" && !locked && !isImported ? (
                            <button
                                onClick={handleGeneratePdf}
                                disabled={pdfLoading}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50"
                            >
                                <FileDown className="h-4 w-4" />
                                {pdfLoading ? t("invoices.pdfGenerating") : t("invoices.generatePdf")}
                            </button>
                        ) : null}

                        {localInvoice.pdfPath ? (
                            <button
                                onClick={handleOpenPdf}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium"
                            >
                                <ExternalLink className="h-4 w-4" />
                                {t("invoices.openPdf")}
                            </button>
                        ) : null}

                        {status === "draft" ? (
                            <button
                                onClick={() => handleStatusChange("sent", "invoices.confirmSent")}
                                disabled={statusLoading || !pdfGenerated}
                                title={!pdfGenerated ? t("invoices.noPdfToEmit") : undefined}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <CheckCircle className="h-4 w-4" />
                                {t("invoices.markSent")}
                            </button>
                        ) : null}

                        {status === "sent" ? (
                            <button
                                onClick={() => setShowMarkPaid(true)}
                                disabled={statusLoading || !pdfGenerated}
                                title={!pdfGenerated ? t("invoices.noPdfForPayment") : undefined}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <DollarSign className="h-4 w-4" />
                                {t("invoices.markPaid")}
                            </button>
                        ) : null}

                        {status === "sent" ? (
                            <button
                                onClick={() => handleStatusChange("refused", "invoices.confirmRefused")}
                                disabled={statusLoading}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50"
                            >
                                <XCircle className="h-4 w-4" />
                                {t("invoices.markRefused")}
                            </button>
                        ) : null}

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

            {showPaymentForm ? (
                <PaymentFormModal
                    invoice={localInvoice}
                    existingPayments={paymentsData}
                    editPayment={editingPayment ?? undefined}
                    onClose={() => { setShowPaymentForm(false); setEditingPayment(null) }}
                    onSaved={handlePaymentSaved}
                />
            ) : null}

            {showMarkPaid ? (
                <MarkPaidDialog
                    invoice={localInvoice}
                    remaining={remaining}
                    onClose={() => setShowMarkPaid(false)}
                    onSaved={handlePaymentSaved}
                />
            ) : null}
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
