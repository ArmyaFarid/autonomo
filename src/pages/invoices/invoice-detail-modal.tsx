import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
    X, FileDown, ExternalLink, CheckCircle, DollarSign, Paperclip, Pencil,
    Plus, Trash2, AlertTriangle, Info, Ban, Send,
} from "lucide-react"
import { useAtomValue } from "jotai"
import { clientsAtom } from "../../store/clientsAtom"
import { profileAtom } from "../../store/profileAtom"
import { formatDate, formatCurrency, cn, isOverdue } from "../../lib/utils"
import { computePaymentStatus } from "../../types/definitions"
import type { Invoice, InvoiceLine, Payment, InvoiceAttachment, CreditNote } from "../../types/definitions"
import { PaymentFormModal } from "./payment-form-modal"
import { MarkPaidDialog } from "./mark-paid-dialog"

const EDIT_WINDOW_MS = 5 * 60 * 1000

const editWindowStart = new Map<number, number>()

interface InvoiceDetailModalProps {
    invoice: Invoice
    lines: InvoiceLine[]
    onClose: () => void
    onUpdated: (updated: Invoice, lines: InvoiceLine[]) => void
    onEdit: (invoice: Invoice, lines: InvoiceLine[]) => void
}

// Phase 1 — document status badge colors
const DOC_STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    issued: "bg-blue-100 text-blue-700",
    voided: "bg-red-100 text-red-700",
}

// Phase 1 — computed payment status badge colors
const PAY_STATUS_COLORS: Record<string, string> = {
    unpaid: "bg-amber-100 text-amber-700",
    partial: "bg-orange-100 text-orange-700",
    paid: "bg-green-100 text-green-700",
    credited: "bg-purple-100 text-purple-700",
    voided: "bg-red-100 text-red-700",
    draft: "bg-gray-100 text-gray-500",
}

export function InvoiceDetailModal({ invoice, lines, onClose, onUpdated, onEdit }: InvoiceDetailModalProps): JSX.Element {
    const { t } = useTranslation()
    const clients = useAtomValue(clientsAtom)
    const profile = useAtomValue(profileAtom)
    const locale = profile?.locale ?? "fr-CA"

    const [localInvoice, setLocalInvoice] = useState<Invoice>(invoice)
    const [localLines, setLocalLines] = useState<InvoiceLine[]>(lines)

    const [pdfLoading, setPdfLoading] = useState(false)
    const [pdfMsg, setPdfMsg] = useState("")
    const [actionLoading, setActionLoading] = useState(false)
    const [error, setError] = useState("")

    const [attachments, setAttachments] = useState<InvoiceAttachment[]>([])
    const [paymentsData, setPaymentsData] = useState<Payment[]>([])
    const [creditNotesData, setCreditNotesData] = useState<CreditNote[]>([])
    const [showPaymentForm, setShowPaymentForm] = useState(false)
    const [showMarkPaid, setShowMarkPaid] = useState(false)
    const [editingPayment, setEditingPayment] = useState<Payment | null>(null)

    // Phase 1 — modal states
    const [showIssueConfirm, setShowIssueConfirm] = useState(false)
    const [showVoidConfirm, setShowVoidConfirm] = useState(false)
    const [showCancelWizard, setShowCancelWizard] = useState(false)
    const [cancelStep, setCancelStep] = useState<"choice" | "credit">("choice")
    const [creditAmount, setCreditAmount] = useState("")
    const [creditReason, setCreditReason] = useState("")
    const [suppressIssue, setSuppressIssue] = useState(() => !!profile?.suppressIssueConfirm)
    const [suppressVoid, setSuppressVoid] = useState(() => !!profile?.suppressVoidConfirm)

    const [, setTick] = useState(0)
    useEffect(() => {
        const interval = setInterval(() => setTick((n) => n + 1), 1000)
        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        setLocalInvoice(invoice)
        setLocalLines(lines)
    }, [invoice.updatedAt])

    useEffect(() => {
        loadAttachments()
        loadPayments()
        loadCreditNotes()
    }, [invoice.id])

    async function loadAttachments(): Promise<void> {
        const res = await window.api.getInvoiceAttachments(localInvoice.id)
        if (res.success && res.data) setAttachments(res.data as InvoiceAttachment[])
    }

    async function loadPayments(): Promise<void> {
        const res = await window.api.getPayments(localInvoice.id)
        if (res.success && res.data) setPaymentsData(res.data as Payment[])
    }

    async function loadCreditNotes(): Promise<void> {
        const res = await window.api.getInvoice(localInvoice.id)
        if (res.success && res.data) {
            const { creditNotes } = res.data as { creditNotes: CreditNote[] }
            if (creditNotes) setCreditNotesData(creditNotes)
        }
    }

    function getSecondsLeft(p: Payment): number {
        const start = editWindowStart.get(p.id) ?? new Date(p.createdAt).getTime()
        return Math.max(0, Math.floor((start + EDIT_WINDOW_MS - Date.now()) / 1000))
    }

    function formatCountdown(seconds: number): string {
        const m = Math.floor(seconds / 60)
        const s = String(seconds % 60).padStart(2, "0")
        return `${m}:${s}`
    }

    async function refreshInvoice(): Promise<void> {
        const res = await window.api.getInvoice(localInvoice.id)
        if (res.success && res.data) {
            const { invoice: updated, lines: updatedLines, creditNotes } = res.data as { invoice: Invoice; lines: InvoiceLine[]; creditNotes: CreditNote[] }
            setLocalInvoice(updated)
            setLocalLines(updatedLines)
            if (creditNotes) setCreditNotesData(creditNotes as CreditNote[])
            onUpdated(updated, updatedLines)
        }
    }

    const client = clients.find((c) => c.id === localInvoice.clientId)
    const isFreeform = localInvoice.invoiceType === "freeform"
    const isImported = localInvoice.invoiceType === "imported"
    const totalHours = localLines.reduce((sum, l) => sum + l.qty, 0)
    const totalPaid = paymentsData.reduce((sum, p) => sum + p.amount, 0)
    const totalCredit = creditNotesData.reduce((sum, cn) => sum + cn.amount, 0)
    const balanceDue = Math.max(0, localInvoice.total - totalPaid - totalCredit)

    // Phase 1 — computed payment status
    const payStatus = computePaymentStatus(localInvoice, totalPaid, totalCredit)
    const docStatus = localInvoice.status
    const overdue = isOverdue(localInvoice, profile?.lateInvoiceAlertDays ?? 30)
    const pdfGenerated = !!localInvoice.pdfPath
    const canEdit = docStatus === "draft" && !isImported
    const canIssue = docStatus === "draft"
    // Void only when no financial transaction has occurred yet
    const canVoid = docStatus === "issued" && payStatus === "unpaid"
    // Credit note when invoice is financially open (unpaid or partially paid)
    const canCredit = docStatus === "issued" && (payStatus === "unpaid" || payStatus === "partial")
    const canReopen = false
    const canRecordPayment = docStatus === "issued" && payStatus !== "paid" && payStatus !== "credited"
    const showPaymentsSection = docStatus === "issued" || payStatus === "paid" || payStatus === "credited"
    const locked = docStatus === "voided" || payStatus === "paid" || payStatus === "credited"

    const docStatusLabel = (s: string): string => ({
        draft: t("invoices.statusDraft"),
        issued: t("invoices.statusIssued"),
        voided: t("invoices.statusVoided"),
    }[s] ?? s)

    const payStatusLabel = (s: string): string => ({
        unpaid: t("invoices.statusUnpaid"),
        partial: t("invoices.statusPartial"),
        paid: t("invoices.statusPaid"),
        credited: t("invoices.statusCredited"),
        voided: t("invoices.statusVoided"),
        draft: t("invoices.statusDraft"),
    }[s] ?? s)

    async function handleGeneratePdf(): Promise<void> {
        setPdfLoading(true)
        setPdfMsg("")
        setError("")
        const result = await window.api.generateInvoicePdf(localInvoice.id)
        if (result.success) {
            setPdfMsg(t("invoices.pdfSuccess"))
            await refreshInvoice()
        } else {
            setError(result.error === "voided" ? t("invoices.pdfVoidedError") : (result.error ?? t("invoices.pdfError")))
        }
        setPdfLoading(false)
    }

    async function handleOpenPdf(): Promise<void> {
        if (!localInvoice.pdfPath) return
        const result = await window.api.openPath(localInvoice.pdfPath)
        if (!result.success) setError(result.error ?? t("common.error"))
    }

    // Phase 1 — Issue invoice
    async function handleIssue(): Promise<void> {
        setShowIssueConfirm(false)
        setActionLoading(true)
        setError("")
        const result = await window.api.issueInvoice(localInvoice.id)
        if (result.success && result.data) {
            const { invoice: updated, lines: updatedLines } = result.data as { invoice: Invoice; lines: InvoiceLine[] }
            setLocalInvoice(updated)
            setLocalLines(updatedLines)
            onUpdated(updated, updatedLines)
        } else {
            setError(result.error ?? t("common.error"))
        }
        setActionLoading(false)
    }

    function handleClickIssue(): void {
        if (suppressIssue) {
            handleIssue()
        } else {
            setShowIssueConfirm(true)
        }
    }

    function handleVoidSelected(): void {
        setShowCancelWizard(false)
        if (suppressVoid) {
            handleVoid()
        } else {
            setShowVoidConfirm(true)
        }
    }

    // Phase 1 — Void invoice
    async function handleVoid(): Promise<void> {
        setShowCancelWizard(false)
        setActionLoading(true)
        setError("")
        const result = await window.api.voidInvoice(localInvoice.id)
        if (result.success) {
            await refreshInvoice()
        } else {
            setError(result.error ?? t("common.error"))
        }
        setActionLoading(false)
    }

    // Phase 1 — Credit note
    async function handleCreditNote(): Promise<void> {
        const amount = parseFloat(creditAmount)
        if (isNaN(amount) || amount <= 0) return
        if (!creditReason.trim()) return
        setShowCancelWizard(false)
        setActionLoading(true)
        setError("")
        const result = await window.api.addCreditNote({ invoiceId: localInvoice.id, amount, reason: creditReason.trim() })
        if (result.success) {
            await refreshInvoice()
            await loadPayments()
        } else {
            setError(result.error ?? t("common.error"))
        }
        setActionLoading(false)
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background flex h-[90vh] w-full max-w-2xl flex-col rounded-lg shadow-lg">

                {/* Header */}
                <div className="flex items-center justify-between border-b px-6 py-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-mono text-lg font-semibold">{localInvoice.number}</h3>
                        {/* Phase 1 — document status badge */}
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", DOC_STATUS_COLORS[docStatus])}>
                            {docStatusLabel(docStatus)}
                        </span>
                        {/* Phase 1 — computed payment status badge (only for issued) */}
                        {docStatus === "issued" ? (
                            <span className={cn("flex items-center gap-1 rounded border px-2 py-0.5 text-xs", PAY_STATUS_COLORS[payStatus])}>
                                {payStatusLabel(payStatus)}
                                <span title={t("invoices.computedStatusInfo")}>
                                    <Info className="h-3 w-3 opacity-60" />
                                </span>
                            </span>
                        ) : null}
                        {isImported ? (
                            <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                {t("invoices.typeImported")}
                            </span>
                        ) : isFreeform ? (
                            <span className="text-muted-foreground rounded border px-2 py-0.5 text-xs">
                                {t("invoices.typeFreeform")}
                            </span>
                        ) : null}
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

                    {overdue && docStatus === "issued" && payStatus !== "paid" ? (
                        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
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
                                        className="border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        {t("payments.add")}
                                    </button>
                                ) : null}
                            </div>

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
                                                    {p.receiptPath ? (
                                                        <button
                                                            onClick={() => window.api.openPath(p.receiptPath!)}
                                                            className="text-green-700 hover:text-green-900 flex h-7 w-7 items-center justify-center rounded"
                                                            title={t("payments.openReceipt")}
                                                        >
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                        </button>
                                                    ) : null}
                                                    {isEditable ? (
                                                        <>
                                                            <button
                                                                onClick={() => { setEditingPayment(p); setShowPaymentForm(true) }}
                                                                className="border-primary/50 text-primary hover:bg-primary/10 inline-flex h-7 items-center gap-1 rounded border px-2 text-xs font-medium"
                                                            >
                                                                <Pencil className="h-3 w-3" />
                                                                {t("payments.editWindow", { time: formatCountdown(secondsLeft) })}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeletePayment(p)}
                                                                className="text-muted-foreground hover:text-destructive flex h-7 w-7 items-center justify-center rounded"
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

                                    {payStatus !== "paid" && payStatus !== "credited" ? (
                                        <div className="flex justify-between text-sm font-semibold">
                                            <span>{t("payments.remainingBalance")}</span>
                                            <span className="text-amber-700">{formatCurrency(balanceDue, locale)}</span>
                                        </div>
                                    ) : null}
                                </div>
                            )}

                            {/* Phase 1 — credit notes list */}
                            {creditNotesData.length > 0 ? (
                                <div className="space-y-1 border-t pt-3">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("invoices.creditNotes")}</p>
                                    {creditNotesData.map((cn) => (
                                        <div key={cn.id} className="flex items-center justify-between rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-sm">
                                            <div className="flex flex-col gap-0.5">
                                                {cn.number ? (
                                                    <span className="font-mono text-xs font-semibold text-purple-900">{cn.number}</span>
                                                ) : null}
                                                <span className="text-purple-800 text-xs">{cn.reason}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-purple-700 font-semibold tabular-nums">− {formatCurrency(cn.amount, locale)}</span>
                                                {cn.pdfPath ? (
                                                    <button
                                                        onClick={() => window.api.openPath(cn.pdfPath!)}
                                                        className="text-purple-600 hover:text-purple-800 flex h-6 w-6 items-center justify-center rounded"
                                                        title={t("invoices.openCreditNotePdf")}
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex justify-between pt-1 text-sm">
                                        <span className="text-muted-foreground">{t("invoices.totalCredit")}</span>
                                        <span className="font-medium text-purple-700">− {formatCurrency(totalCredit, locale)}</span>
                                    </div>
                                </div>
                            ) : null}
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
                                            <button onClick={() => window.api.openPath(a.path)} className="text-muted-foreground hover:text-foreground flex h-7 w-7 items-center justify-center rounded">
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </button>
                                            {!locked ? (
                                                <button onClick={() => handleDeleteAttachment(a.id)} className="text-muted-foreground hover:text-destructive flex h-7 w-7 items-center justify-center rounded">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Phase 2 — PDF auto-info tooltip */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Info className="h-3 w-3 flex-shrink-0" />
                        <span>{t("invoices.pdfAutoInfo")}</span>
                    </div>

                    {error ? <p className="text-destructive text-sm">{error}</p> : null}
                    {pdfMsg ? <p className="text-sm text-green-600">{pdfMsg}</p> : null}
                </div>

                {/* Action bar */}
                <div className="border-t px-6 py-4">
                    <div className="flex flex-wrap gap-2">

                        {canEdit ? (
                            <button
                                onClick={() => onEdit(localInvoice, localLines)}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium"
                            >
                                <Pencil className="h-4 w-4" />
                                {t("invoices.edit")}
                            </button>
                        ) : null}

                        {/* PDF generate/regenerate — always available for non-imported invoices when PDF is missing */}
                        {!isImported && docStatus !== "voided" && !pdfGenerated ? (
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

                        {localInvoice.creditedPdfPath ? (
                            <button
                                onClick={() => window.api.openPath(localInvoice.creditedPdfPath!)}
                                className="border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-800 inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium"
                            >
                                <ExternalLink className="h-4 w-4" />
                                {t("invoices.openCreditedPdf")}
                            </button>
                        ) : null}

                        {/* Phase 1 — Issue button replaces old "Mark Sent" */}
                        {canIssue ? (
                            <button
                                onClick={handleClickIssue}
                                disabled={actionLoading}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-50"
                            >
                                <Send className="h-4 w-4" />
                                {actionLoading ? t("common.loading") : t("invoices.issue")}
                            </button>
                        ) : null}

                        {/* Phase 1 — Mark Paid (opens existing MarkPaidDialog) */}
                        {canRecordPayment ? (
                            <button
                                onClick={() => setShowMarkPaid(true)}
                                disabled={actionLoading}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50"
                            >
                                <DollarSign className="h-4 w-4" />
                                {t("invoices.markPaid")}
                            </button>
                        ) : null}

                        {/* Phase 1 — Cancel: void (no payments) or credit note (any open balance) */}
                        {(canVoid || canCredit) ? (
                            <button
                                onClick={() => {
                                    setCreditAmount(balanceDue.toFixed(2))
                                    setCancelStep(canVoid ? "choice" : "credit")
                                    setShowCancelWizard(true)
                                }}
                                disabled={actionLoading}
                                className="border-input hover:bg-destructive/10 hover:text-destructive hover:border-destructive inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium text-muted-foreground disabled:opacity-50"
                            >
                                <Ban className="h-4 w-4" />
                                {t("invoices.markCancelled")}
                            </button>
                        ) : null}

                        {canReopen ? (
                            <button
                                onClick={handleReopen}
                                disabled={actionLoading}
                                className="border-input bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50"
                            >
                                <RotateCcw className="h-4 w-4" />
                                {t("invoices.reopen")}
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Phase 1 — Issue confirmation modal */}
            {showIssueConfirm ? (
                <ConfirmModal
                    title={t("invoices.issueConfirmTitle")}
                    body={t("invoices.issueEffect")}
                    suppressLabel={t("invoices.dontShowAgain")}
                    onSuppressChange={(v) => { setSuppressIssue(v); window.api.saveProfile({ suppressIssueConfirm: v ? 1 : 0 }) }}
                    onConfirm={handleIssue}
                    onCancel={() => setShowIssueConfirm(false)}
                    confirmLabel={t("invoices.issue")}
                    confirmClassName="bg-primary text-primary-foreground hover:bg-primary/90"
                    icon={<CheckCircle className="h-5 w-5 text-primary" />}
                />
            ) : null}

            {/* Phase 1 — Void confirmation modal */}
            {showVoidConfirm ? (
                <ConfirmModal
                    title={t("invoices.cancelOptionVoidTitle")}
                    body={t("invoices.cancelOptionVoidDesc")}
                    suppressLabel={t("invoices.dontShowAgain")}
                    onSuppressChange={(v) => { setSuppressVoid(v); window.api.saveProfile({ suppressVoidConfirm: v ? 1 : 0 }) }}
                    onConfirm={handleVoid}
                    onCancel={() => setShowVoidConfirm(false)}
                    confirmLabel={t("invoices.cancelConfirmVoid")}
                    confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
                />
            ) : null}

            {/* Phase 1 — Cancellation wizard */}
            {showCancelWizard ? (
                <CancelWizard
                    balanceDue={balanceDue}
                    canVoid={canVoid}
                    step={cancelStep}
                    onStepChange={setCancelStep}
                    creditAmount={creditAmount}
                    creditReason={creditReason}
                    onCreditAmountChange={setCreditAmount}
                    onCreditReasonChange={setCreditReason}
                    onVoidSelected={handleVoidSelected}
                    onCredit={handleCreditNote}
                    onClose={() => setShowCancelWizard(false)}
                    locale={locale}
                />
            ) : null}

            {showPaymentForm ? (
                <PaymentFormModal
                    invoice={localInvoice}
                    existingPayments={paymentsData}
                    totalCredit={totalCredit}
                    editPayment={editingPayment ?? undefined}
                    onClose={() => { setShowPaymentForm(false); setEditingPayment(null) }}
                    onSaved={handlePaymentSaved}
                />
            ) : null}

            {showMarkPaid ? (
                <MarkPaidDialog
                    invoice={localInvoice}
                    remaining={balanceDue}
                    onClose={() => setShowMarkPaid(false)}
                    onSaved={handlePaymentSaved}
                />
            ) : null}
        </div>
    )
}

// Phase 1 — generic confirmation modal with "don't show again" checkbox
interface ConfirmModalProps {
    title: string
    body: string
    suppressLabel: string
    onSuppressChange: (v: boolean) => void
    onConfirm: () => void
    onCancel: () => void
    confirmLabel: string
    confirmClassName: string
    icon?: React.ReactNode
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    title, body, suppressLabel, onSuppressChange, onConfirm, onCancel, confirmLabel, confirmClassName, icon,
}) => {
    const { t } = useTranslation()
    const [suppress, setSuppress] = useState(false)

    function handleConfirm(): void {
        if (suppress) onSuppressChange(true)
        onConfirm()
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background w-full max-w-sm rounded-lg shadow-lg">
                <div className="px-5 py-5 space-y-4">
                    <div className="flex items-start gap-3">
                        {icon ? <div className="flex-shrink-0 mt-0.5">{icon}</div> : null}
                        <div>
                            <p className="font-semibold">{title}</p>
                            <p className="text-muted-foreground mt-1 text-sm">{body}</p>
                        </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={suppress}
                            onChange={(e) => setSuppress(e.target.checked)}
                            className="accent-primary"
                        />
                        {suppressLabel}
                    </label>
                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="border-input bg-background hover:bg-accent inline-flex h-10 flex-1 items-center justify-center rounded-md border px-4 text-sm font-medium"
                        >
                            {t("common.cancel")}
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            className={cn("inline-flex h-10 flex-1 items-center justify-center rounded-md px-4 text-sm font-medium", confirmClassName)}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Phase 1 — unified cancellation wizard (VOID vs CREDIT NOTE)
interface CancelWizardProps {
    balanceDue: number
    canVoid: boolean
    step: "choice" | "credit"
    onStepChange: (s: "choice" | "credit") => void
    creditAmount: string
    creditReason: string
    onCreditAmountChange: (v: string) => void
    onCreditReasonChange: (v: string) => void
    onVoidSelected: () => void
    onCredit: () => void
    onClose: () => void
    locale: string
}

const CancelWizard: React.FC<CancelWizardProps> = ({
    balanceDue, canVoid, step, onStepChange, creditAmount, creditReason,
    onCreditAmountChange, onCreditReasonChange, onVoidSelected, onCredit, onClose, locale,
}) => {
    const { t } = useTranslation()
    const fmt = (n: number): string => locale.startsWith("en") ? `$${n.toFixed(2)}` : `${n.toFixed(2).replace(".", ",")} $`
    const textareaCn = "border-input bg-background ring-offset-background focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background w-full max-w-md rounded-lg shadow-lg">
                <div className="flex items-center justify-between border-b px-5 py-4">
                    <h3 className="font-semibold">{t("invoices.cancelWizardTitle")}</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded p-1">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {step === "choice" ? (
                    <div className="px-5 py-5 space-y-3">
                        <p className="text-sm text-muted-foreground">{t("invoices.cancelWizardSubtitle")}</p>

                        <button
                            type="button"
                            onClick={onVoidSelected}
                            className="w-full rounded-md border-2 border-destructive/40 bg-red-50 p-4 text-left hover:bg-red-100 transition-colors"
                        >
                            <p className="font-semibold text-red-800">{t("invoices.cancelOptionVoidTitle")}</p>
                            <p className="text-red-700 text-xs mt-1">{t("invoices.cancelOptionVoidDesc")}</p>
                        </button>

                        <button
                            type="button"
                            onClick={() => onStepChange("credit")}
                            className="w-full rounded-md border-2 border-purple-200 bg-purple-50 p-4 text-left hover:bg-purple-100 transition-colors"
                        >
                            <p className="font-semibold text-purple-900">{t("invoices.cancelOptionCreditTitle")}</p>
                            <p className="text-purple-700 text-xs mt-1">{t("invoices.cancelOptionCreditDesc")}</p>
                        </button>
                    </div>
                ) : (
                    <div className="px-5 py-5 space-y-4">
                        <p className="text-sm text-muted-foreground">{t("invoices.cancelOptionCreditDesc")}</p>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">{t("invoices.creditNoteAmount")}</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="0.01"
                                    max={balanceDue}
                                    step="0.01"
                                    value={creditAmount}
                                    onChange={(e) => onCreditAmountChange(e.target.value)}
                                    className="border-input bg-background focus-visible:ring-ring flex h-10 w-40 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                                />
                                <span className="text-muted-foreground text-sm">{t("payments.remainingBalance")}: {fmt(balanceDue)}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">{t("invoices.creditNoteReason")} *</label>
                            <textarea
                                rows={2}
                                value={creditReason}
                                onChange={(e) => onCreditReasonChange(e.target.value)}
                                placeholder={t("invoices.creditNoteReasonPlaceholder")}
                                className={textareaCn}
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            {canVoid ? (
                                <button type="button" onClick={() => onStepChange("choice")} className="border-input bg-background hover:bg-accent inline-flex h-9 flex-1 items-center justify-center rounded-md border text-sm font-medium">
                                    {t("common.back")}
                                </button>
                            ) : (
                                <button type="button" onClick={onClose} className="border-input bg-background hover:bg-accent inline-flex h-9 flex-1 items-center justify-center rounded-md border text-sm font-medium">
                                    {t("common.cancel")}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onCredit}
                                disabled={!creditReason.trim() || parseFloat(creditAmount) <= 0}
                                className="bg-purple-600 text-white hover:bg-purple-700 inline-flex h-9 flex-1 items-center justify-center rounded-md text-sm font-medium disabled:opacity-50"
                            >
                                {t("invoices.cancelConfirmCredit")}
                            </button>
                        </div>
                    </div>
                )}
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
