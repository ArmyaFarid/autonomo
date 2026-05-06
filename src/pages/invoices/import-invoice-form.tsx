import { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ChevronLeft, Paperclip, Check, X, Info, AlertTriangle } from "lucide-react"
import { useAtomValue } from "jotai"
import { clientsAtom } from "../../store/clientsAtom"
import { profileAtom } from "../../store/profileAtom"
import { cn, toIsoDate } from "../../lib/utils"
import type { Invoice } from "../../types/definitions"

const GST_RATE = 0.05
const QST_RATE = 0.09975

const importSchema = z.object({
    number: z.string().min(1),
    clientId: z.coerce.number().min(1),
    issueDate: z.string().min(1),
    dueDate: z.string().optional(),
    periodStart: z.string().min(1),
    periodEnd: z.string().min(1),
    totalHours: z.coerce.number().min(0.01),
    subtotal: z.coerce.number().min(0.01),
    enableGst: z.boolean(),
    enableQst: z.boolean(),
    description: z.string().optional(),
    status: z.enum(["draft", "issued"]),
    notes: z.string().optional(),
    alreadyPaid: z.boolean(),
    paymentDate: z.string().optional(),
    paymentAmount: z.coerce.number().optional(),
    paymentMethod: z.enum(["wire", "cheque", "interac", "other"]).optional(),
})

type ImportFormValues = z.infer<typeof importSchema>

interface ImportInvoiceFormProps {
    onSaved: () => void
    onCancel: () => void
}

export function ImportInvoiceForm({ onSaved, onCancel }: ImportInvoiceFormProps): JSX.Element {
    const { t } = useTranslation()
    const clients = useAtomValue(clientsAtom)
    const profile = useAtomValue(profileAtom)
    const locale = profile?.locale ?? "fr-CA"
    const activeClients = clients.filter((c) => c.active === 1)

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [syncSequence, setSyncSequence] = useState(true)
    const [pdfSourcePath, setPdfSourcePath] = useState<string | null>(null)
    const [paymentProofPath, setPaymentProofPath] = useState<string | null>(null)
    const [numberExists, setNumberExists] = useState(false)
    const numberCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const form = useForm<ImportFormValues>({
        resolver: zodResolver(importSchema),
        defaultValues: {
            number: "",
            clientId: 0,
            issueDate: toIsoDate(new Date()),
            dueDate: "",
            periodStart: "",
            periodEnd: "",
            totalHours: 0,
            subtotal: 0,
            enableGst: false,
            enableQst: false,
            description: "",
            status: "issued",
            notes: "",
            alreadyPaid: true,
            paymentDate: toIsoDate(new Date()),
            paymentAmount: undefined,
            paymentMethod: "wire",
        },
    })

    const { watch, setValue } = form
    const subtotal = parseFloat(String(watch("subtotal"))) || 0
    const enableGst = watch("enableGst")
    const enableQst = watch("enableQst")
    const alreadyPaid = watch("alreadyPaid")
    const numberValue = watch("number")
    const gstAmount = enableGst ? subtotal * GST_RATE : 0
    const qstAmount = enableQst ? subtotal * QST_RATE : 0
    const total = subtotal + gstAmount + qstAmount

    useEffect(() => {
        if (alreadyPaid) {
            setValue("status", "issued")
            if (!watch("paymentAmount")) {
                setValue("paymentAmount", total || undefined)
            }
        }
    }, [alreadyPaid])

    useEffect(() => {
        if (alreadyPaid && total > 0) {
            setValue("paymentAmount", total)
        }
    }, [total, alreadyPaid])

    useEffect(() => {
        if (!numberValue.trim()) {
            setNumberExists(false)
            return
        }
        if (numberCheckRef.current) clearTimeout(numberCheckRef.current)
        numberCheckRef.current = setTimeout(async () => {
            const res = await window.api.checkInvoiceNumberExists(numberValue.trim())
            setNumberExists(res.success && !!(res.data as { exists: boolean })?.exists)
        }, 400)
    }, [numberValue])

    const fmt = (n: number): string =>
        locale.startsWith("en") ? `$${n.toFixed(2)}` : `${n.toFixed(2).replace(".", ",")} $`

    async function pickPdf(): Promise<void> {
        const result = await window.api.openFileDialog({
            title: t("invoices.importAttachPdf"),
            properties: ["openFile"],
            filters: [{ name: "PDF", extensions: ["pdf"] }],
        })
        if (result.success && (result.data as string[])?.[0]) {
            setPdfSourcePath((result.data as string[])[0])
        }
    }

    async function pickPaymentProof(): Promise<void> {
        const result = await window.api.openFileDialog({
            title: t("invoices.legacyPaymentProof"),
            properties: ["openFile"],
            filters: [
                { name: "Images / PDF", extensions: ["pdf", "png", "jpg", "jpeg"] },
            ],
        })
        if (result.success && (result.data as string[])?.[0]) {
            setPaymentProofPath((result.data as string[])[0])
        }
    }

    async function onSubmit(values: ImportFormValues): Promise<void> {
        if (numberExists) return
        setError("")
        setLoading(true)

        const invoiceData = {
            number: values.number.trim(),
            clientId: Number(values.clientId),
            issueDate: values.issueDate,
            periodStart: values.periodStart,
            periodEnd: values.periodEnd,
            invoiceType: "imported" as const,
            description: values.description || "",
            subtotal,
            gstRate: values.enableGst ? GST_RATE : 0,
            qstRate: values.enableQst ? QST_RATE : 0,
            gstAmount,
            qstAmount,
            total,
            dueDate: values.dueDate || null,
            status: values.status,
            notes: values.notes || null,
        }

        const lines = [{
            position: 0,
            label: t("invoices.importSummaryLine"),
            description: null,
            qty: values.totalHours,
            unitPrice: values.totalHours > 0 ? subtotal / values.totalHours : subtotal,
            amount: subtotal,
        }]

        const result = await window.api.createInvoice({ invoice: invoiceData, lines })

        if (!result.success) {
            setError(result.error ?? t("common.error"))
            setLoading(false)
            return
        }

        const saved = (result.data as { invoice: Invoice }).invoice

        if (syncSequence) {
            const year = parseInt(values.issueDate.substring(0, 4), 10)
            await window.api.syncInvoiceSequenceFromImport(values.number.trim(), year)
        }

        if (pdfSourcePath) {
            await window.api.attachImportedPdf({ invoiceId: saved.id, sourcePath: pdfSourcePath })
        }

        if (values.alreadyPaid && values.paymentDate && values.paymentAmount && values.paymentMethod) {
            const payRes = await window.api.createPayment({
                invoiceId: saved.id,
                paymentDate: values.paymentDate,
                amount: values.paymentAmount,
                paymentMethod: values.paymentMethod,
                reference: null,
                notes: null,
            })
            if (payRes.success && paymentProofPath && (payRes.data as { id: number })?.id) {
                await window.api.addPaymentProof({
                    paymentId: (payRes.data as { id: number }).id,
                    invoiceId: saved.id,
                    sourcePath: paymentProofPath,
                })
            }
        }

        setLoading(false)
        onSaved()
    }

    return (
        <div className="mx-auto max-w-2xl p-8">
            <div className="mb-6 flex items-center gap-3">
                <button onClick={onCancel} className="text-muted-foreground hover:text-foreground rounded p-1">
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div>
                    <h2 className="text-2xl font-semibold">{t("invoices.legacyTitle")}</h2>
                    <p className="text-muted-foreground text-sm">{t("invoices.legacySubtitle")}</p>
                </div>
            </div>

            {/* Educational tooltip */}
            <div className="mb-6 flex gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <p className="text-sm text-amber-800">{t("invoices.legacyTooltip")}</p>
            </div>

            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className={cn(
                    "space-y-6 rounded-lg border p-6",
                    "border-amber-200 bg-amber-50/30"
                )}
            >

                <Section title={t("invoices.client")}>
                    <Field label={`${t("invoices.number")} *`} error={form.formState.errors.number?.message}>
                        <input
                            {...form.register("number")}
                            type="text"
                            placeholder="2024-001"
                            className={cn(inputCn, numberExists && "border-amber-400 focus-visible:ring-amber-400")}
                        />
                        {numberExists ? (
                            <div className="flex items-center gap-1.5 text-amber-700">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <p className="text-xs">{t("invoices.numberExists")}</p>
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-xs">{t("invoices.importNumberHint")}</p>
                        )}
                        <div className="mt-2 space-y-1.5">
                            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-sm">
                                <input
                                    type="radio"
                                    checked={syncSequence}
                                    onChange={() => setSyncSequence(true)}
                                    className="mt-0.5 shrink-0"
                                />
                                <div>
                                    <span className="font-medium text-blue-900">{t("invoices.sequenceAuto")}</span>
                                    <p className="text-muted-foreground mt-0.5 text-xs">{t("invoices.sequenceAutoHint")}</p>
                                </div>
                            </label>
                            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm">
                                <input
                                    type="radio"
                                    checked={!syncSequence}
                                    onChange={() => setSyncSequence(false)}
                                    className="mt-0.5 shrink-0"
                                />
                                <div>
                                    <span className="font-medium">{t("invoices.sequenceForce")}</span>
                                    <p className="text-muted-foreground mt-0.5 text-xs">{t("invoices.sequenceForceHint")}</p>
                                </div>
                            </label>
                        </div>
                    </Field>
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
                    <div className="grid grid-cols-2 gap-4">
                        <Field label={`${t("invoices.issueDate")} *`}>
                            <input {...form.register("issueDate")} type="date" className={inputCn} />
                        </Field>
                        <Field label={t("invoices.dueDateOptional")}>
                            <input {...form.register("dueDate")} type="date" className={inputCn} />
                        </Field>
                    </div>
                </Section>

                <Section title={`${t("invoices.periodStart")} / ${t("invoices.periodEnd")}`}>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label={`${t("invoices.periodStart")} *`} error={form.formState.errors.periodStart?.message}>
                            <input {...form.register("periodStart")} type="date" className={inputCn} />
                        </Field>
                        <Field label={`${t("invoices.periodEnd")} *`} error={form.formState.errors.periodEnd?.message}>
                            <input {...form.register("periodEnd")} type="date" className={inputCn} />
                        </Field>
                    </div>
                    <Field label={`${t("invoices.importTotalHours")} *`} error={form.formState.errors.totalHours?.message}>
                        <div className="flex items-center gap-3">
                            <input
                                {...form.register("totalHours")}
                                type="number"
                                min="0"
                                step="0.5"
                                className="border-input bg-background focus-visible:ring-ring flex h-10 w-36 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                            />
                            <span className="text-muted-foreground text-sm">h</span>
                        </div>
                    </Field>
                </Section>

                <Section title={t("invoices.subtotal")}>
                    <Field label={`${t("invoices.importSubtotal")} *`} error={form.formState.errors.subtotal?.message}>
                        <input
                            {...form.register("subtotal")}
                            type="number"
                            min="0"
                            step="0.01"
                            className="border-input bg-background focus-visible:ring-ring flex h-10 w-48 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                        />
                    </Field>
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
                </Section>

                <Section title={t("invoices.description")}>
                    <textarea
                        {...form.register("description")}
                        rows={3}
                        placeholder={t("invoices.description")}
                        className={textareaCn}
                    />
                </Section>

                <Section title={t("invoices.status")}>
                    <Field label={`${t("invoices.importStatus")} *`}>
                        <select {...form.register("status")} className={selectCn} disabled={alreadyPaid}>
                            <option value="issued">{t("invoices.statusIssued")}</option>
                            <option value="draft">{t("invoices.statusDraft")}</option>
                        </select>
                    </Field>
                </Section>

                {/* Already paid toggle */}
                <Section title="">
                    <label className="flex cursor-pointer items-start gap-3">
                        <input
                            {...form.register("alreadyPaid")}
                            type="checkbox"
                            className="accent-primary mt-0.5"
                        />
                        <div>
                            <span className="text-sm font-medium">{t("invoices.alreadyPaid")}</span>
                            <p className="text-muted-foreground text-xs">{t("invoices.importSubtitle")}</p>
                        </div>
                    </label>

                    {alreadyPaid ? (
                        <div className="mt-3 space-y-3 rounded-md border border-green-200 bg-green-50/40 p-4">
                            <div className="grid grid-cols-2 gap-4">
                                <Field label={`${t("invoices.legacyPaymentDate")} *`}>
                                    <input {...form.register("paymentDate")} type="date" className={inputCn} />
                                </Field>
                                <Field label={`${t("invoices.legacyPaymentAmount")} *`}>
                                    <input
                                        {...form.register("paymentAmount")}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className={inputCn}
                                    />
                                </Field>
                            </div>
                            <Field label={t("invoices.legacyPaymentMethod")}>
                                <select {...form.register("paymentMethod")} className={selectCn}>
                                    <option value="wire">{t("payments.methods.wire")}</option>
                                    <option value="cheque">{t("payments.methods.cheque")}</option>
                                    <option value="interac">{t("payments.methods.interac")}</option>
                                    <option value="other">{t("payments.methods.other")}</option>
                                </select>
                            </Field>
                            <Field label={t("invoices.legacyPaymentProof")}>
                                {paymentProofPath ? (
                                    <div className="border-input flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
                                        <Check className="h-4 w-4 flex-shrink-0 text-green-500" />
                                        <span className="min-w-0 flex-1 truncate text-xs">{paymentProofPath.split("/").pop()}</span>
                                        <button
                                            type="button"
                                            onClick={() => setPaymentProofPath(null)}
                                            className="text-muted-foreground hover:text-destructive flex h-7 w-7 flex-shrink-0 items-center justify-center rounded"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={pickPaymentProof}
                                        className="border-input bg-white hover:bg-muted/50 inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm"
                                    >
                                        <Paperclip className="h-4 w-4" />
                                        {t("invoices.legacyPaymentProof")}
                                    </button>
                                )}
                            </Field>
                        </div>
                    ) : null}
                </Section>

                <Section title={t("invoices.importAttachPdf")}>
                    {pdfSourcePath ? (
                        <div className="border-input flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <Check className="h-4 w-4 flex-shrink-0 text-green-500" />
                            <span className="min-w-0 flex-1 truncate text-xs">{pdfSourcePath.split("/").pop()}</span>
                            <button
                                type="button"
                                onClick={() => setPdfSourcePath(null)}
                                className="text-muted-foreground hover:text-destructive flex h-7 w-7 flex-shrink-0 items-center justify-center rounded"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={pickPdf}
                            className="border-input bg-background hover:bg-muted/50 inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm"
                        >
                            <Paperclip className="h-4 w-4" />
                            {t("invoices.importAttachPdf")}
                        </button>
                    )}
                    <p className="text-muted-foreground text-xs">{t("invoices.importPdfHint")}</p>
                </Section>

                <Section title={t("invoices.notes")}>
                    <textarea {...form.register("notes")} rows={2} className={textareaCn} />
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
                        type="submit"
                        disabled={loading || numberExists}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 flex-1 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
                    >
                        {loading ? t("common.loading") : t("invoices.importSave")}
                    </button>
                </div>
            </form>
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
