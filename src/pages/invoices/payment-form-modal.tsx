import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { X, Paperclip } from "lucide-react"
import { useAtomValue } from "jotai"
import { profileAtom } from "../../store/profileAtom"
import { formatCurrency } from "../../lib/utils"
import type { Invoice, Payment } from "../../types/definitions"

const paymentSchema = z.object({
    paymentDate: z.string().min(1),
    amount: z.coerce.number().positive(),
    paymentMethod: z.enum(["wire", "cheque", "interac", "other"]),
    reference: z.string().optional(),
    notes: z.string().optional(),
})

type PaymentFormValues = z.infer<typeof paymentSchema>

interface PaymentFormModalProps {
    invoice: Invoice
    existingPayments: Payment[]
    totalCredit?: number
    editPayment?: Payment
    onClose: () => void
    onSaved: (payment: Payment) => void
}

function toIsoDate(d: Date): string {
    return d.toISOString().split("T")[0]
}

export function PaymentFormModal({ invoice, existingPayments, totalCredit = 0, editPayment, onClose, onSaved }: PaymentFormModalProps): JSX.Element {
    const { t } = useTranslation()
    const profile = useAtomValue(profileAtom)
    const locale = profile?.locale ?? "fr-CA"
    const isEdit = !!editPayment

    // When editing, exclude the payment being edited from the "already paid" sum
    const otherPayments = existingPayments.filter((p) => p.id !== editPayment?.id)
    const totalPaid = otherPayments.reduce((sum, p) => sum + p.amount, 0)
    const remaining = Math.max(0, invoice.total - totalPaid - totalCredit)

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [proofFile, setProofFile] = useState<string | null>(null)

    const form = useForm<PaymentFormValues>({
        resolver: zodResolver(paymentSchema),
        defaultValues: {
            paymentDate: editPayment?.paymentDate ?? toIsoDate(new Date()),
            amount: editPayment?.amount ?? remaining,
            paymentMethod: (editPayment?.paymentMethod as PaymentFormValues["paymentMethod"]) ?? "wire",
            reference: editPayment?.reference ?? "",
            notes: editPayment?.notes ?? "",
        },
    })

    async function handleAttachProof(): Promise<void> {
        const result = await window.api.openFileDialog({
            filters: [{ name: "Documents", extensions: ["pdf", "png", "jpg", "jpeg"] }],
            properties: ["openFile"],
        })
        if (result.success && result.data) setProofFile((result.data as string[])[0])
    }

    async function onSubmit(values: PaymentFormValues): Promise<void> {
        if (!confirm(t("payments.confirmSave"))) return
        setLoading(true)
        setError("")

        let payment: Payment

        if (isEdit) {
            const result = await window.api.updatePayment(editPayment!.id, {
                paymentDate: values.paymentDate,
                amount: values.amount,
                paymentMethod: values.paymentMethod,
                reference: values.reference || null,
                notes: values.notes || null,
            })
            if (!result.success) {
                setError(result.error ?? t("common.error"))
                setLoading(false)
                return
            }
            payment = result.data as Payment
        } else {
            const result = await window.api.createPayment({
                invoiceId: invoice.id,
                paymentDate: values.paymentDate,
                amount: values.amount,
                paymentMethod: values.paymentMethod,
                reference: values.reference || null,
                notes: values.notes || null,
            })
            if (!result.success) {
                setError(result.error ?? t("common.error"))
                setLoading(false)
                return
            }
            payment = result.data as Payment
        }

        if (proofFile) {
            await window.api.addPaymentProof({
                paymentId: payment.id,
                invoiceId: invoice.id,
                sourcePath: proofFile,
            })
        }

        setLoading(false)
        onSaved(payment)
    }

    const fmt = (n: number): string =>
        locale.startsWith("en") ? `$${n.toFixed(2)}` : `${n.toFixed(2).replace(".", ",")} $`

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background w-full max-w-md rounded-lg shadow-lg">
                <div className="flex items-center justify-between border-b px-6 py-4">
                    <h3 className="font-semibold">
                        {isEdit ? t("payments.edit") : t("payments.add")}
                    </h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    {/* Balance summary */}
                    <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("invoices.total")}</span>
                            <span className="font-medium">{formatCurrency(invoice.total, locale)}</span>
                        </div>
                        {totalPaid > 0 ? (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t("payments.totalPaid")}</span>
                                <span>{fmt(totalPaid)}</span>
                            </div>
                        ) : null}
                        {totalCredit > 0 ? (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t("invoices.totalCredit")}</span>
                                <span className="text-purple-700">− {fmt(totalCredit)}</span>
                            </div>
                        ) : null}
                        <div className="flex justify-between border-t pt-1 font-semibold">
                            <span>{t("payments.remainingBalance")}</span>
                            <span>{fmt(remaining)}</span>
                        </div>
                    </div>

                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <Field label={`${t("payments.date")} *`} error={form.formState.errors.paymentDate?.message}>
                            <input {...form.register("paymentDate")} type="date" className={inputCn} />
                        </Field>

                        <Field label={`${t("payments.amount")} *`} error={form.formState.errors.amount?.message}>
                            <input
                                {...form.register("amount")}
                                type="number"
                                min="0.01"
                                step="0.01"
                                className={inputCn}
                            />
                        </Field>

                        <Field label={`${t("payments.method")} *`} error={form.formState.errors.paymentMethod?.message}>
                            <select {...form.register("paymentMethod")} className={selectCn}>
                                <option value="wire">{t("payments.methods.wire")}</option>
                                <option value="cheque">{t("payments.methods.cheque")}</option>
                                <option value="interac">{t("payments.methods.interac")}</option>
                                <option value="other">{t("payments.methods.other")}</option>
                            </select>
                        </Field>

                        <Field label={t("payments.reference")}>
                            <input {...form.register("reference")} type="text" className={inputCn} />
                        </Field>

                        <Field label={t("payments.notes")}>
                            <textarea {...form.register("notes")} rows={2} className={textareaCn} />
                        </Field>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={handleAttachProof}
                                className="border-input bg-background hover:bg-muted/50 inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm"
                            >
                                <Paperclip className="h-4 w-4" />
                                {t(proofFile ? "payments.proofAttached" : "payments.proof")}
                            </button>
                            {proofFile ? (
                                <span className="text-muted-foreground max-w-[160px] truncate text-xs">
                                    {proofFile.split("/").pop()}
                                </span>
                            ) : null}
                        </div>

                        {error ? <p className="text-destructive text-sm">{error}</p> : null}

                        <div className="flex gap-3 border-t pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="border-input bg-background hover:bg-accent inline-flex h-10 flex-1 items-center justify-center rounded-md border px-4 text-sm font-medium"
                            >
                                {t("common.cancel")}
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 flex-1 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
                            >
                                {loading ? t("common.loading") : t("common.save")}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

interface FieldProps { label: string; error?: string; children: React.ReactNode }
const Field: React.FC<FieldProps> = ({ label, error, children }) => (
    <div className="space-y-1">
        <label className="text-sm font-medium">{label}</label>
        {children}
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
)

const inputCn = "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
const textareaCn = "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
const selectCn = "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
