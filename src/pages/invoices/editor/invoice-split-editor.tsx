import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronLeft, Plus, Trash2 } from "lucide-react"
import { useAtomValue } from "jotai"
import { clientsAtom } from "../../../store/clientsAtom"
import { profileAtom } from "../../../store/profileAtom"
import { toIsoDate, cn } from "../../../lib/utils"
import { buildPreviewHtml, type PreviewLine } from "./preview-builder"

const GST_RATE = 0.05
const QST_RATE = 0.09975

interface InvoiceSplitEditorProps {
    onBack: () => void
}

interface WeekRow { start: string; end: string; hours: number }
interface FreeRow { label: string; description: string; qty: number; unitPrice: number }

const inputCn = "border-input bg-background focus-visible:ring-ring h-8 w-full rounded border px-2 py-1 text-sm focus-visible:ring-1 focus-visible:outline-none"
const labelCn = "mb-0.5 block text-xs font-medium text-muted-foreground"

export function InvoiceSplitEditor({ onBack }: InvoiceSplitEditorProps): JSX.Element {
    const { t } = useTranslation()
    const clients = useAtomValue(clientsAtom)
    const profile = useAtomValue(profileAtom)
    const locale = profile?.locale ?? "fr-CA"
    const activeClients = clients.filter((c) => c.active === 1)

    const today = toIsoDate(new Date())
    const due = new Date(); due.setDate(due.getDate() + 30)

    const [clientId, setClientId] = useState(0)
    const [number, setNumber] = useState("—")
    const [issueDate, setIssueDate] = useState(today)
    const [dueDate, setDueDate] = useState(toIsoDate(due))
    const [periodStart, setPeriodStart] = useState(today)
    const [periodEnd, setPeriodEnd] = useState(today)
    const [invoiceType, setInvoiceType] = useState<"weekly" | "freeform">("weekly")
    const [description, setDescription] = useState("")
    const [enableGst, setEnableGst] = useState(false)
    const [enableQst, setEnableQst] = useState(false)
    const [weekRows, setWeekRows] = useState<WeekRow[]>([{ start: today, end: today, hours: 0 }])
    const [freeRows, setFreeRows] = useState<FreeRow[]>([{ label: "", description: "", qty: 1, unitPrice: profile?.defaultHourlyRate ?? 23 }])

    useEffect(() => {
        window.api.getNextInvoiceNumber().then((r) => { if (r.success) setNumber(r.data as string) })
    }, [])

    const selectedClient = activeClients.find((c) => c.id === clientId) ?? null

    const lines: PreviewLine[] = invoiceType === "weekly"
        ? weekRows.map((w) => ({
            label: t("invoices.weekLabel") + ` ${w.start} – ${w.end}`,
            description: `${w.start} – ${w.end}`,
            qty: w.hours,
            unitPrice: profile?.defaultHourlyRate ?? 23,
            amount: w.hours * (profile?.defaultHourlyRate ?? 23),
        }))
        : freeRows.map((r) => ({
            label: r.label,
            description: r.description,
            qty: r.qty,
            unitPrice: r.unitPrice,
            amount: r.qty * r.unitPrice,
        }))

    const subtotal = lines.reduce((s, l) => s + l.amount, 0)
    const gstAmount = enableGst ? subtotal * GST_RATE : 0
    const qstAmount = enableQst ? subtotal * QST_RATE : 0
    const total = subtotal + gstAmount + qstAmount

    const previewHtml = useMemo(() => buildPreviewHtml({
        profile,
        client: selectedClient,
        number,
        issueDate,
        dueDate: dueDate || null,
        periodStart,
        periodEnd,
        invoiceType,
        description,
        lines,
        subtotal,
        gstAmount,
        qstAmount,
        total,
        locale,
    }), [clientId, number, issueDate, dueDate, periodStart, periodEnd, invoiceType, description, enableGst, enableQst, weekRows, freeRows])

    function updateWeekRow(i: number, field: keyof WeekRow, value: string | number): void {
        setWeekRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
    }

    function updateFreeRow(i: number, field: keyof FreeRow, value: string | number): void {
        setFreeRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
    }

    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <div className="border-b bg-background flex items-center gap-3 px-4 py-2">
                <button type="button" onClick={onBack} className="hover:bg-accent flex items-center gap-1 rounded px-2 py-1 text-sm">
                    <ChevronLeft className="h-4 w-4" />
                    {t("common.back")}
                </button>
                <span className="text-sm font-semibold">Option A — Vue divisée</span>
                <span className="text-muted-foreground text-xs">Le formulaire à gauche, la prévisualisation en direct à droite.</span>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* ── Left: form ── */}
                <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r p-4">
                    {/* Client */}
                    <div>
                        <label className={labelCn}>{t("invoices.client")}</label>
                        <select value={clientId} onChange={(e) => setClientId(Number(e.target.value))} className={inputCn}>
                            <option value={0}>{t("invoices.selectClient")}</option>
                            {activeClients.map((c) => (
                                <option key={c.id} value={c.id}>{c.companyName ?? c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Number + issue date */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className={labelCn}>{t("invoices.number")}</label>
                            <input value={number} onChange={(e) => setNumber(e.target.value)} className={inputCn} />
                        </div>
                        <div>
                            <label className={labelCn}>{t("invoices.issueDate")}</label>
                            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputCn} />
                        </div>
                    </div>

                    {/* Due date */}
                    <div>
                        <label className={labelCn}>{t("invoices.dueDateOptional")}</label>
                        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCn} />
                    </div>

                    {/* Period */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className={labelCn}>{t("invoices.periodStart")}</label>
                            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={inputCn} />
                        </div>
                        <div>
                            <label className={labelCn}>{t("invoices.periodEnd")}</label>
                            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputCn} />
                        </div>
                    </div>

                    {/* Invoice type */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setInvoiceType("weekly")}
                            className={cn("flex-1 rounded border py-1 text-xs font-medium", invoiceType === "weekly" ? "bg-primary text-primary-foreground border-primary" : "border-input")}
                        >
                            {t("invoices.typeWeekly")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setInvoiceType("freeform")}
                            className={cn("flex-1 rounded border py-1 text-xs font-medium", invoiceType === "freeform" ? "bg-primary text-primary-foreground border-primary" : "border-input")}
                        >
                            {t("invoices.typeFreeform")}
                        </button>
                    </div>

                    {/* Week rows */}
                    {invoiceType === "weekly" ? (
                        <div className="space-y-2">
                            {weekRows.map((row, i) => (
                                <div key={i} className="grid grid-cols-[1fr_1fr_60px_24px] gap-1 items-end">
                                    <div>
                                        {i === 0 ? <label className={labelCn}>Début</label> : null}
                                        <input type="date" value={row.start} onChange={(e) => updateWeekRow(i, "start", e.target.value)} className={inputCn} />
                                    </div>
                                    <div>
                                        {i === 0 ? <label className={labelCn}>Fin</label> : null}
                                        <input type="date" value={row.end} onChange={(e) => updateWeekRow(i, "end", e.target.value)} className={inputCn} />
                                    </div>
                                    <div>
                                        {i === 0 ? <label className={labelCn}>Heures</label> : null}
                                        <input type="number" min="0" step="0.5" value={row.hours} onChange={(e) => updateWeekRow(i, "hours", parseFloat(e.target.value) || 0)} className={inputCn} />
                                    </div>
                                    <button type="button" onClick={() => setWeekRows((p) => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive mt-auto pb-1">
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                            <button type="button" onClick={() => setWeekRows((p) => [...p, { start: today, end: today, hours: 0 }])} className="flex items-center gap-1 text-xs text-primary">
                                <Plus className="h-3 w-3" /> {t("invoices.addRow")}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {freeRows.map((row, i) => (
                                <div key={i} className="space-y-1 rounded border p-2">
                                    <div className="grid grid-cols-[1fr_24px] gap-1">
                                        <input placeholder={t("invoices.rowLabel")} value={row.label} onChange={(e) => updateFreeRow(i, "label", e.target.value)} className={inputCn} />
                                        <button type="button" onClick={() => setFreeRows((p) => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
                                    <input placeholder={t("invoices.rowDescriptionHint")} value={row.description} onChange={(e) => updateFreeRow(i, "description", e.target.value)} className={inputCn} />
                                    <div className="grid grid-cols-2 gap-1">
                                        <input type="number" min="0" step="0.5" placeholder={t("invoices.rowQty")} value={row.qty} onChange={(e) => updateFreeRow(i, "qty", parseFloat(e.target.value) || 0)} className={inputCn} />
                                        <input type="number" min="0" step="0.5" placeholder={t("invoices.rowRate")} value={row.unitPrice} onChange={(e) => updateFreeRow(i, "unitPrice", parseFloat(e.target.value) || 0)} className={inputCn} />
                                    </div>
                                </div>
                            ))}
                            <button type="button" onClick={() => setFreeRows((p) => [...p, { label: "", description: "", qty: 1, unitPrice: profile?.defaultHourlyRate ?? 23 }])} className="flex items-center gap-1 text-xs text-primary">
                                <Plus className="h-3 w-3" /> {t("invoices.addRow")}
                            </button>
                        </div>
                    )}

                    {/* Description */}
                    <div>
                        <label className={labelCn}>{t("invoices.description")}</label>
                        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="border-input bg-background focus-visible:ring-ring w-full rounded border px-2 py-1 text-sm focus-visible:ring-1 focus-visible:outline-none" />
                    </div>

                    {/* Taxes */}
                    <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 text-sm">
                            <input type="checkbox" checked={enableGst} onChange={(e) => setEnableGst(e.target.checked)} />
                            TPS (5%)
                        </label>
                        <label className="flex items-center gap-1.5 text-sm">
                            <input type="checkbox" checked={enableQst} onChange={(e) => setEnableQst(e.target.checked)} />
                            TVQ (9.975%)
                        </label>
                    </div>
                </div>

                {/* ── Right: live preview ── */}
                <div className="flex-1 overflow-hidden bg-muted/30">
                    <iframe
                        srcDoc={previewHtml}
                        className="h-full w-full border-0"
                        sandbox="allow-same-origin"
                        title="Invoice preview"
                    />
                </div>
            </div>
        </div>
    )
}
