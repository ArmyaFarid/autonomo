import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ChevronLeft, Columns2, Plus, Trash2, X } from "lucide-react"
import { useAtomValue } from "jotai"
import { clientsAtom } from "../../store/clientsAtom"
import { profileAtom } from "../../store/profileAtom"
import { toIsoDate, formatDate, cn } from "../../lib/utils"
import type { Client, Invoice, InvoiceLine } from "../../types/definitions"
import { buildPreviewHtml } from "./editor/preview-builder"
import type { PreviewLine } from "./editor/preview-builder"

const GST_RATE = 0.05
const QST_RATE = 0.09975

const SERVICE_KEYS = [
    "feature_dev",
    "prototyping",
    "ai_research",
    "architecture",
    "code_review",
    "meetings",
    "documentation",
    "infrastructure",
] as const

// Frontend-only shape for a week row (weekly mode)
interface WeekRow {
    start: string
    end: string
    hours: number
}

// Frontend-only shape for a freeform row
interface FreeformRow {
    label: string
    description: string
    qty: number
    unitPrice: number
    amount: number
}

function lastCompletedBiweeklyPeriod(): { start: string; end: string } {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const lastSunday = new Date(today)
    lastSunday.setDate(today.getDate() - dayOfWeek)
    const twoWeeksAgoMonday = new Date(lastSunday)
    twoWeeksAgoMonday.setDate(lastSunday.getDate() - 13)
    return { start: toIsoDate(twoWeeksAgoMonday), end: toIsoDate(lastSunday) }
}

function suggestPeriod(client: Client): { start: string; end: string } {
    const today = new Date()
    if (client.billingFrequency === "monthly") {
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const lastOfMonth = new Date(today.getFullYear(), today.getMonth(), 0)
        return { start: toIsoDate(firstOfMonth), end: toIsoDate(lastOfMonth) }
    }
    if (client.billingFrequency === "biweekly") {
        return lastCompletedBiweeklyPeriod()
    }
    return { start: toIsoDate(today), end: toIsoDate(today) }
}

function calcWeeks(startStr: string, endStr: string): { start: string; end: string }[] {
    const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d) }
    const periodEnd = parse(endStr)
    const result: { start: string; end: string }[] = []
    let cursor = parse(startStr)
    while (cursor <= periodEnd) {
        const weekStart = new Date(cursor)
        const weekEnd = new Date(cursor)
        weekEnd.setDate(weekEnd.getDate() + 6)
        if (weekEnd > periodEnd) weekEnd.setTime(periodEnd.getTime())
        result.push({ start: toIsoDate(weekStart), end: toIsoDate(weekEnd) })
        cursor = new Date(weekEnd)
        cursor.setDate(cursor.getDate() + 1)
    }
    return result
}

function linesToWeekRows(lines: InvoiceLine[]): WeekRow[] {
    return lines.map((l) => ({
        start: l.description?.split(" – ")[0] ?? "",
        end: l.description?.split(" – ")[1] ?? "",
        hours: l.qty,
    }))
}

function linesToFreeformRows(lines: InvoiceLine[], defaultRate: number): FreeformRow[] {
    if (lines.length === 0) {
        return [{ label: "", description: "", qty: 1, unitPrice: defaultRate, amount: defaultRate }]
    }
    return lines.map((l) => ({
        label: l.label,
        description: l.description ?? "",
        qty: l.qty,
        unitPrice: l.unitPrice,
        amount: l.amount,
    }))
}

const invoiceSchema = z.object({
    clientId: z.coerce.number().min(1),
    issueDate: z.string().min(1),
    periodStart: z.string().min(1),
    periodEnd: z.string().min(1),
    freeformTotalHours: z.coerce.number().min(0),
    description: z.string(),
    enableGst: z.boolean(),
    enableQst: z.boolean(),
    notes: z.string().optional(),
})

type InvoiceFormValues = z.infer<typeof invoiceSchema>

interface CreateInvoiceFormProps {
    invoice?: Invoice
    invoiceLines?: InvoiceLine[]
    onSaved: () => void
    onCancel: () => void
}

export function CreateInvoiceForm({ invoice, invoiceLines: editLines, onSaved, onCancel }: CreateInvoiceFormProps): JSX.Element {
    const { t } = useTranslation()
    const clients = useAtomValue(clientsAtom)
    const profile = useAtomValue(profileAtom)
    const locale = profile?.locale ?? "fr-CA"
    const activeClients = clients.filter((c) => c.active === 1)
    const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(invoice ?? null)
    const editMode = !!currentInvoice
    const defaultRate = profile?.defaultHourlyRate ?? 23

    const initType = (invoice?.invoiceType ?? "weekly") as "weekly" | "freeform"
    const [invoiceType, setInvoiceType] = useState<"weekly" | "freeform">(initType)

    const [weekRows, setWeekRows] = useState<WeekRow[]>(() =>
        editMode && initType === "weekly" && editLines?.length
            ? linesToWeekRows(editLines)
            : []
    )
    const [freeformRows, setFreeformRows] = useState<FreeformRow[]>(() =>
        editMode && initType === "freeform" && editLines
            ? linesToFreeformRows(editLines, defaultRate)
            : [{ label: "", description: "", qty: 1, unitPrice: defaultRate, amount: defaultRate }]
    )
    const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [nextNumber, setNextNumber] = useState("—")
    const [dueDate, setDueDate] = useState<string | null>(() => {
        if (editMode) return invoice!.dueDate ?? null
        const d = new Date()
        d.setDate(d.getDate() + 30)
        return toIsoDate(d)
    })
    const [hideClientAddress, setHideClientAddress] = useState(() => !!invoice?.hideClientAddress)
    // Skip the clientId effect on initial mount when editing — we already have saved data
    const skipClientPrefillRef = useRef(editMode)

    const defaultPeriod = lastCompletedBiweeklyPeriod()

    const form = useForm<InvoiceFormValues>({
        resolver: zodResolver(invoiceSchema),
        defaultValues: {
            clientId: invoice?.clientId ?? 0,
            issueDate: invoice?.issueDate ?? toIsoDate(new Date()),
            periodStart: invoice?.periodStart ?? defaultPeriod.start,
            periodEnd: invoice?.periodEnd ?? defaultPeriod.end,
            freeformTotalHours: 0,
            description: invoice?.description ?? "",
            enableGst: (invoice?.gstRate ?? 0) > 0,
            enableQst: (invoice?.qstRate ?? 0) > 0,
            notes: invoice?.notes ?? "",
        },
    })

    const [showPreview, setShowPreview] = useState(false)

    const { watch, setValue } = form
    const clientId = watch("clientId")
    const periodStart = watch("periodStart")
    const periodEnd = watch("periodEnd")
    const issueDate = watch("issueDate")
    const description = watch("description")
    const freeformTotalHours = watch("freeformTotalHours")
    const enableGst = watch("enableGst")
    const enableQst = watch("enableQst")

    const weeklyTotalHours = weekRows.reduce((sum, w) => sum + w.hours, 0)
    const weeklySubtotal = weekRows.reduce((sum, w) => sum + w.hours * (freeformRows[0]?.unitPrice ?? defaultRate), 0)

    // For weekly, derive rate from first week row's unitPrice (stored separately via a ref)
    const [weeklyRate, setWeeklyRate] = useState<number>(
        editMode && initType === "weekly" && editLines?.[0] ? editLines[0].unitPrice : defaultRate
    )

    const weeklySubtotalFinal = weekRows.reduce((sum, w) => sum + w.hours * weeklyRate, 0)
    const freeformSubtotal = freeformRows.reduce((sum, r) => sum + r.amount, 0)
    const subtotal = invoiceType === "weekly" ? weeklySubtotalFinal : freeformSubtotal
    const gstAmount = enableGst ? subtotal * GST_RATE : 0
    const qstAmount = enableQst ? subtotal * QST_RATE : 0
    const total = subtotal + gstAmount + qstAmount

    useEffect(() => {
        if (editMode) { setNextNumber(currentInvoice!.number); return }
        window.api.getNextInvoiceNumber().then((res) => {
            if (res.success && res.data) setNextNumber(res.data as string)
        })
    }, [])

    // Recalculate week structure when period changes (weekly mode only)
    useEffect(() => {
        if (!periodStart || !periodEnd || periodStart > periodEnd) return
        const structure = calcWeeks(periodStart, periodEnd)
        setWeekRows((prev) =>
            structure.map((w, i) => ({
                ...w,
                hours: i < prev.length ? prev[i].hours : 0,
            }))
        )
    }, [periodStart, periodEnd])

    // Pre-fill from client when selected — skipped on initial mount in edit mode
    useEffect(() => {
        if (skipClientPrefillRef.current) {
            skipClientPrefillRef.current = false
            return
        }
        if (!clientId || Number(clientId) === 0) return
        const client = activeClients.find((c) => c.id === Number(clientId))
        if (!client) return
        setHideClientAddress(!!client.hideClientAddress)
        const period = suggestPeriod(client)
        setValue("periodStart", period.start)
        setValue("periodEnd", period.end)
        const hours = client.defaultHoursPerPeriod ?? 0
        const structure = calcWeeks(period.start, period.end)
        setWeekRows(structure.map((w) => ({ ...w, hours })))
        const rate = client.hourlyRate ?? defaultRate
        setWeeklyRate(rate)
        setFreeformRows((prev) =>
            prev.map((r) => ({ ...r, unitPrice: rate, amount: rate * r.qty }))
        )
    }, [clientId])

    // Sync description textarea when service checkboxes change
    useEffect(() => {
        const labels = SERVICE_KEYS
            .filter((k) => selectedServices.has(k))
            .map((k) => t(`invoices.services.${k}`))
        if (labels.length > 0) setValue("description", labels.join("\n"))
    }, [selectedServices])

    function toggleService(key: string): void {
        setSelectedServices((prev) => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
    }

    function updateWeekHours(index: number, hours: number): void {
        setWeekRows((prev) => {
            const next = [...prev]
            next[index] = { ...next[index], hours }
            return next
        })
    }

    function updateFreeformRow(index: number, field: keyof FreeformRow, value: string): void {
        setFreeformRows((prev) => {
            const next = [...prev]
            const row = { ...next[index] }
            if (field === "label" || field === "description") {
                row[field] = value
            } else {
                const num = parseFloat(value) || 0
                ;(row as Record<string, unknown>)[field] = num
                row.amount = row.unitPrice * row.qty
            }
            next[index] = row
            return next
        })
    }

    function addFreeformRow(): void {
        setFreeformRows((prev) => [
            ...prev,
            { label: "", description: "", qty: 1, unitPrice: prev[0]?.unitPrice ?? defaultRate, amount: prev[0]?.unitPrice ?? defaultRate },
        ])
    }

    function removeFreeformRow(index: number): void {
        setFreeformRows((prev) => prev.filter((_, i) => i !== index))
    }

    async function submit(values: InvoiceFormValues, status: "draft" | "sent"): Promise<Invoice | null> {
        setError("")

        if (invoiceType === "weekly") {
            const valid = await form.trigger(["clientId", "issueDate", "periodStart", "periodEnd"])
            if (!valid) return null
            if (weekRows.length === 0) { setError(t("invoices.selectPeriodFirst")); return null }
            if (weeklyTotalHours === 0) { setError(t("invoices.hoursRequired")); return null }
        } else {
            const valid = await form.trigger(["clientId", "issueDate", "periodStart", "periodEnd", "freeformTotalHours"])
            if (!valid) return null
            if (freeformRows.length === 0 || freeformRows.some((r) => !r.label.trim())) {
                setError(t("invoices.freeformRowsError"))
                return null
            }
        }

        setLoading(true)

        const invoiceData = {
            number: editMode ? currentInvoice!.number : `DRAFT-${Date.now()}`,
            clientId: Number(values.clientId),
            issueDate: values.issueDate,
            periodStart: values.periodStart,
            periodEnd: values.periodEnd,
            invoiceType,
            description: values.description,
            subtotal,
            gstRate: values.enableGst ? GST_RATE : 0,
            qstRate: values.enableQst ? QST_RATE : 0,
            gstAmount,
            qstAmount,
            total,
            dueDate: dueDate ?? null,
            status,
            hideClientAddress: hideClientAddress ? 1 : 0,
            notes: values.notes || null,
        }

        const lines = invoiceType === "weekly"
            ? weekRows.map((w, i) => ({
                position: i,
                label: `${t("invoices.weekLabel")} ${i + 1}`,
                description: `${formatDate(w.start, locale)} – ${formatDate(w.end, locale)}`,
                qty: w.hours,
                unitPrice: weeklyRate,
                amount: w.hours * weeklyRate,
            }))
            : freeformRows.map((r, i) => ({
                position: i,
                label: r.label,
                description: r.description || null,
                qty: r.qty,
                unitPrice: r.unitPrice,
                amount: r.amount,
            }))

        const result = editMode
            ? await window.api.updateInvoice(currentInvoice!.id, { invoice: invoiceData, lines })
            : await window.api.createInvoice({ invoice: invoiceData, lines })

        if (result.success) {
            return (result.data as { invoice: Invoice }).invoice
        } else {
            setError(result.error ?? t("common.error"))
            setLoading(false)
            return null
        }
    }

    async function handleSaveDraft(): Promise<void> {
        const saved = await submit(form.getValues(), "draft")
        if (saved) onSaved()
    }

    async function handleSaveAndPreview(): Promise<void> {
        const saved = await submit(form.getValues(), "draft")
        if (!saved) return
        setCurrentInvoice(saved)
        const pdfResult = await window.api.generateInvoicePdf(saved.id)
        setLoading(false)
        if (pdfResult.success && pdfResult.data) {
            await window.api.openPath(pdfResult.data as string)
        } else if (!pdfResult.success) {
            setError(pdfResult.error ?? t("invoices.pdfError"))
        }
    }

    const fmt = (n: number): string =>
        locale.startsWith("en") ? `$${n.toFixed(2)}` : `${n.toFixed(2).replace(".", ",")} $`

    const selectedClient = useMemo(
        () => activeClients.find((c) => c.id === Number(clientId)) ?? null,
        [clientId, activeClients]
    )

    const previewLines = useMemo((): PreviewLine[] => {
        if (invoiceType === "weekly") {
            return weekRows.map((w, i) => ({
                label: `${t("invoices.weekLabel")} ${i + 1}`,
                description: `${w.start} – ${w.end}`,
                qty: w.hours,
                unitPrice: weeklyRate,
                amount: w.hours * weeklyRate,
            }))
        }
        return freeformRows.map((r) => ({
            label: r.label,
            description: r.description,
            qty: r.qty,
            unitPrice: r.unitPrice,
            amount: r.amount,
        }))
    }, [invoiceType, weekRows, freeformRows, weeklyRate])

    const previewHtml = useMemo(() => {
        if (!showPreview) return ""
        return buildPreviewHtml({
            profile,
            client: selectedClient,
            number: nextNumber,
            issueDate,
            dueDate,
            periodStart,
            periodEnd,
            invoiceType,
            description,
            lines: previewLines,
            subtotal,
            gstAmount,
            qstAmount,
            total,
            locale,
        })
    }, [showPreview, selectedClient, nextNumber, issueDate, dueDate, periodStart, periodEnd, invoiceType, description, previewLines, subtotal, gstAmount, qstAmount, total])

    const header = (
        <div className="mb-6 flex items-center gap-3">
            <button onClick={onCancel} className="text-muted-foreground hover:text-foreground rounded p-1">
                <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex-1">
                <h2 className="text-2xl font-semibold">
                    {editMode ? t("invoices.edit") : t("invoices.new")}
                </h2>
                <p className="text-muted-foreground text-sm">N° {nextNumber}</p>
            </div>
            <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                title="Aperçu en direct"
                className={cn(
                    "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    showPreview
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input bg-background text-muted-foreground hover:text-foreground"
                )}
            >
                <Columns2 className="h-4 w-4" />
                Aperçu
            </button>
        </div>
    )

    return (
        <div className={showPreview ? "flex h-screen overflow-hidden" : ""}>
            <div className={showPreview ? "w-[580px] shrink-0 overflow-y-auto p-8" : "mx-auto max-w-2xl p-8"}>
                {header}

            <form className="space-y-6">
                {/* Client + date */}
                <Section title={t("invoices.client")}>
                    <Field label={`${t("invoices.client")} *`} error={form.formState.errors.clientId?.message}>
                        <select {...form.register("clientId")} className={selectCn}>
                            <option value={0}>{t("invoices.selectClient")}</option>
                            {activeClients.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.companyName ? `${c.companyName} (${c.name})` : c.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label={`${t("invoices.issueDate")} *`}>
                        <input {...form.register("issueDate")} type="date" className={inputCn} />
                    </Field>
                    <Field label={t("invoices.dueDateOptional")}>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={dueDate ?? ""}
                                onChange={(e) => setDueDate(e.target.value || null)}
                                className={cn(inputCn, "flex-1")}
                            />
                            {dueDate ? (
                                <button
                                    type="button"
                                    onClick={() => setDueDate(null)}
                                    className="border-input bg-background hover:bg-muted/50 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"
                                    title={t("common.cancel")}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            ) : null}
                        </div>
                    </Field>
                </Section>

                {/* Period — always required */}
                <Section title={`${t("invoices.periodStart")} / ${t("invoices.periodEnd")}`}>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label={`${t("invoices.periodStart")} *`} error={form.formState.errors.periodStart?.message}>
                            <input {...form.register("periodStart")} type="date" className={inputCn} />
                        </Field>
                        <Field label={`${t("invoices.periodEnd")} *`} error={form.formState.errors.periodEnd?.message}>
                            <input {...form.register("periodEnd")} type="date" className={inputCn} />
                        </Field>
                    </div>
                </Section>

                {/* Invoice type toggle */}
                <div className="overflow-hidden rounded-lg border">
                    <div className="flex">
                        <button
                            type="button"
                            onClick={() => setInvoiceType("weekly")}
                            className={cn(
                                "flex-1 border-r px-4 py-3 text-left text-sm transition-colors",
                                invoiceType === "weekly"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-background hover:bg-muted/50"
                            )}
                        >
                            <p className="font-semibold">{t("invoices.typeWeekly")}</p>
                            <p className={cn("mt-0.5 text-xs", invoiceType === "weekly" ? "opacity-75" : "text-muted-foreground")}>
                                {t("invoices.typeWeeklyDesc")}
                            </p>
                        </button>
                        <button
                            type="button"
                            onClick={() => setInvoiceType("freeform")}
                            className={cn(
                                "flex-1 px-4 py-3 text-left text-sm transition-colors",
                                invoiceType === "freeform"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-background hover:bg-muted/50"
                            )}
                        >
                            <p className="font-semibold">{t("invoices.typeFreeform")}</p>
                            <p className={cn("mt-0.5 text-xs", invoiceType === "freeform" ? "opacity-75" : "text-muted-foreground")}>
                                {t("invoices.typeFreeformDesc")}
                            </p>
                        </button>
                    </div>
                </div>

                {/* Weekly: dynamic week rows */}
                {invoiceType === "weekly" ? (
                    <Section title={t("invoices.totalHours")}>
                        {weekRows.length === 0 ? (
                            <p className="text-muted-foreground text-sm italic">{t("invoices.selectPeriodFirst")}</p>
                        ) : (
                            <div className="space-y-2">
                                {weekRows.map((week, i) => (
                                    <div key={i} className="flex items-center gap-4">
                                        <div className="w-48">
                                            <p className="text-sm font-medium">{t("invoices.weekLabel")} {i + 1}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatDate(week.start, locale)} – {formatDate(week.end, locale)}
                                            </p>
                                        </div>
                                        <input
                                            type="number"
                                            value={week.hours}
                                            min="0"
                                            step="0.5"
                                            onChange={(e) => updateWeekHours(i, parseFloat(e.target.value) || 0)}
                                            className="border-input bg-background focus-visible:ring-ring flex h-10 w-24 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                                        />
                                        <span className="text-muted-foreground text-sm">h</span>
                                        <span className="text-muted-foreground text-sm ml-auto">
                                            = {fmt(week.hours * weeklyRate)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <Field label={`${t("invoices.hourlyRate")} *`}>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    value={weeklyRate}
                                    min="0"
                                    step="0.5"
                                    onChange={(e) => setWeeklyRate(parseFloat(e.target.value) || 0)}
                                    className="border-input bg-background focus-visible:ring-ring flex h-10 w-36 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                                />
                                <span className="text-muted-foreground text-sm">= {fmt(weeklySubtotalFinal)}</span>
                            </div>
                        </Field>
                    </Section>
                ) : (
                    /* Freeform: compliance hours + rows */
                    <>
                        <Section title={t("invoices.totalHoursCompliance")}>
                            <Field
                                label={`${t("invoices.totalHoursCompliance")} *`}
                                error={form.formState.errors.freeformTotalHours?.message}
                            >
                                <div className="flex items-center gap-3">
                                    <input
                                        {...form.register("freeformTotalHours")}
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        className="border-input bg-background focus-visible:ring-ring flex h-10 w-36 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                                    />
                                    <span className="text-muted-foreground text-sm">h</span>
                                </div>
                            </Field>
                        </Section>

                        <Section title={t("invoices.freeformRows")}>
                            <div className="space-y-2">
                                {/* Column headers */}
                                <div className="grid grid-cols-[1fr_1fr_90px_60px_90px_32px] gap-2 px-1">
                                    <span className="text-muted-foreground text-xs font-medium">{t("invoices.rowLabel")}</span>
                                    <span className="text-muted-foreground text-xs font-medium">{t("invoices.rowDescription")}</span>
                                    <span className="text-muted-foreground text-xs font-medium text-right">{t("invoices.rowRate")}</span>
                                    <span className="text-muted-foreground text-xs font-medium text-right">{t("invoices.rowQty")}</span>
                                    <span className="text-muted-foreground text-xs font-medium text-right">{t("invoices.rowAmount")}</span>
                                    <span />
                                </div>
                                {freeformRows.map((row, i) => (
                                    <div key={i} className="grid grid-cols-[1fr_1fr_90px_60px_90px_32px] items-center gap-2">
                                        <input
                                            type="text"
                                            value={row.label}
                                            onChange={(e) => updateFreeformRow(i, "label", e.target.value)}
                                            placeholder={t("invoices.rowLabel")}
                                            className={inputCn}
                                        />
                                        <input
                                            type="text"
                                            value={row.description}
                                            onChange={(e) => updateFreeformRow(i, "description", e.target.value)}
                                            placeholder={t("invoices.rowDescriptionHint")}
                                            className={inputCn}
                                        />
                                        <input
                                            type="number"
                                            value={row.unitPrice}
                                            min="0"
                                            step="0.5"
                                            onChange={(e) => updateFreeformRow(i, "unitPrice", e.target.value)}
                                            className={inputCn}
                                        />
                                        <input
                                            type="number"
                                            value={row.qty}
                                            min="0"
                                            step="0.5"
                                            onChange={(e) => updateFreeformRow(i, "qty", e.target.value)}
                                            className={inputCn}
                                        />
                                        <div className="border-input bg-muted flex h-10 items-center justify-end rounded-md border px-3 text-sm font-medium">
                                            {fmt(row.amount)}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeFreeformRow(i)}
                                            disabled={freeformRows.length === 1}
                                            className="text-muted-foreground hover:text-destructive flex h-8 w-8 items-center justify-center rounded disabled:opacity-30"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={addFreeformRow}
                                    className="border-input bg-background hover:bg-muted/50 mt-1 inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm"
                                >
                                    <Plus className="h-4 w-4" />
                                    {t("invoices.addRow")}
                                </button>
                            </div>
                        </Section>
                    </>
                )}

                {/* Description — always shown for both types */}
                <Section title={t("invoices.description")}>
                    <p className="text-muted-foreground -mt-2 mb-3 text-xs">{t("invoices.descriptionHint")}</p>
                    <div className="mb-3 grid grid-cols-2 gap-2">
                        {SERVICE_KEYS.map((key) => (
                            <label
                                key={key}
                                className={cn(
                                    "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                                    selectedServices.has(key)
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:bg-muted/50"
                                )}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedServices.has(key)}
                                    onChange={() => toggleService(key)}
                                    className="accent-primary"
                                />
                                {t(`invoices.services.${key}`)}
                            </label>
                        ))}
                    </div>
                    <textarea
                        {...form.register("description")}
                        rows={3}
                        placeholder={t("invoices.description")}
                        className={textareaCn}
                    />
                </Section>

                {/* GST / QST */}
                <Section title="TPS / TVQ">
                    <div className="space-y-2">
                        <label className="flex cursor-pointer items-center gap-3">
                            <input {...form.register("enableGst")} type="checkbox" className="accent-primary" />
                            <span className="text-sm">{t("invoices.enableGst")}</span>
                            {enableGst ? <span className="text-muted-foreground text-sm">{fmt(gstAmount)}</span> : null}
                        </label>
                        <label className="flex cursor-pointer items-center gap-3">
                            <input {...form.register("enableQst")} type="checkbox" className="accent-primary" />
                            <span className="text-sm">{t("invoices.enableQst")}</span>
                            {enableQst ? <span className="text-muted-foreground text-sm">{fmt(qstAmount)}</span> : null}
                        </label>
                    </div>
                </Section>

                {/* Totals preview */}
                <div className="rounded-md border p-4">
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("invoices.subtotal")}</span>
                            <span>{fmt(subtotal)}</span>
                        </div>
                        {enableGst ? (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t("invoices.gst")}</span>
                                <span>{fmt(gstAmount)}</span>
                            </div>
                        ) : null}
                        {enableQst ? (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t("invoices.qst")}</span>
                                <span>{fmt(qstAmount)}</span>
                            </div>
                        ) : null}
                        <div className="flex justify-between border-t pt-2 text-base font-semibold">
                            <span>{t("invoices.total")}</span>
                            <span>{fmt(total)}</span>
                        </div>
                    </div>
                </div>

                <Section title={t("invoices.notes")}>
                    <textarea {...form.register("notes")} rows={2} className={textareaCn} />
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={hideClientAddress}
                            onChange={(e) => setHideClientAddress(e.target.checked)}
                            className="h-4 w-4 rounded border"
                        />
                        {t("invoices.hideClientAddress")}
                    </label>
                </Section>

                {error ? <p className="text-destructive text-sm">{error}</p> : null}

                <div className="flex gap-3 border-t pt-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="border-input bg-background hover:bg-accent inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={loading}
                        className="border-input bg-background hover:bg-accent inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium disabled:opacity-50"
                    >
                        {t("invoices.saveAsDraft")}
                    </button>
                    <button
                        type="button"
                        onClick={handleSaveAndPreview}
                        disabled={loading}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 flex-1 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
                    >
                        {loading ? t("common.loading") : t("invoices.saveAndPreview")}
                    </button>
                </div>
            </form>
            </div>
            {showPreview ? (
                <div className="flex-1 bg-muted/30">
                    <iframe
                        srcDoc={previewHtml}
                        className="h-full w-full border-0"
                        sandbox="allow-same-origin"
                        title="Aperçu facture"
                    />
                </div>
            ) : null}
        </div>
    )
}

interface SectionProps { title: string; children: React.ReactNode }
const Section: React.FC<SectionProps> = ({ title, children }) => (
    <div className="space-y-3">
        {title ? <h3 className="border-b pb-1 text-sm font-semibold">{title}</h3> : null}
        {children}
    </div>
)

interface FieldProps { label: string; error?: string; children: React.ReactNode }
const Field: React.FC<FieldProps> = ({ label, error, children }) => (
    <div className="space-y-1">
        {label ? <label className="text-sm font-medium">{label}</label> : null}
        {children}
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
)

const inputCn = "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
const textareaCn = "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
const selectCn = "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
