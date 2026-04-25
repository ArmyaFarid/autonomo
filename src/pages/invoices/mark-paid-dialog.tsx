import { useState } from "react"
import { useTranslation } from "react-i18next"
import { X, Paperclip, Check } from "lucide-react"
import { useAtomValue } from "jotai"
import { profileAtom } from "../../store/profileAtom"
import { formatCurrency } from "../../lib/utils"
import type { Invoice, Payment } from "../../types/definitions"

interface MarkPaidDialogProps {
    invoice: Invoice
    remaining: number
    onClose: () => void
    onSaved: (payment: Payment) => void
}

function toIsoDate(d: Date): string {
    return d.toISOString().split("T")[0]
}

export function MarkPaidDialog({ invoice, remaining, onClose, onSaved }: MarkPaidDialogProps): JSX.Element {
    const { t } = useTranslation()
    const profile = useAtomValue(profileAtom)
    const locale = profile?.locale ?? "fr-CA"

    const [method, setMethod] = useState<"wire" | "cheque" | "interac" | "other">("wire")
    const [paymentDate, setPaymentDate] = useState(toIsoDate(new Date()))
    const [reference, setReference] = useState("")
    const [proofPath, setProofPath] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    async function pickProof(): Promise<void> {
        const result = await window.api.openFileDialog({
            title: t("payments.proof"),
            properties: ["openFile"],
            filters: [{ name: "Documents", extensions: ["pdf", "png", "jpg", "jpeg"] }],
        })
        if (result.success && (result.data as string[])?.[0]) {
            setProofPath((result.data as string[])[0])
        }
    }

    async function handleConfirm(): Promise<void> {
        setLoading(true)
        setError("")
        const result = await window.api.createPayment({
            invoiceId: invoice.id,
            paymentDate,
            amount: remaining,
            paymentMethod: method,
            reference: reference.trim() || null,
        })
        if (!result.success) {
            setError(result.error ?? t("common.error"))
            setLoading(false)
            return
        }
        const saved = result.data as Payment
        if (proofPath) {
            await window.api.addPaymentProof({ paymentId: saved.id, invoiceId: invoice.id, sourcePath: proofPath })
        }
        setLoading(false)
        onSaved(saved)
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background w-full max-w-sm rounded-lg shadow-lg">
                <div className="flex items-center justify-between border-b px-5 py-4">
                    <h3 className="font-semibold">{t("invoices.markPaid")}</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                    <div className="rounded-md border bg-muted/30 px-4 py-3 flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">{t("payments.amount")}</span>
                        <span className="text-lg font-semibold">{formatCurrency(remaining, locale)}</span>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium">{t("payments.date")}</label>
                        <input
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            className={inputCn}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium">{t("payments.method")}</label>
                        <select
                            value={method}
                            onChange={(e) => setMethod(e.target.value as typeof method)}
                            className={selectCn}
                        >
                            <option value="wire">{t("payments.methods.wire")}</option>
                            <option value="cheque">{t("payments.methods.cheque")}</option>
                            <option value="interac">{t("payments.methods.interac")}</option>
                            <option value="other">{t("payments.methods.other")}</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium">
                            {t("payments.reference")}
                            <span className="text-muted-foreground ml-1 font-normal text-xs">({t("common.optional")})</span>
                        </label>
                        <input
                            type="text"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder={t("payments.referencePlaceholder")}
                            className={inputCn}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium">
                            {t("payments.proof")}
                            <span className="text-muted-foreground ml-1 font-normal text-xs">({t("common.optional")})</span>
                        </label>
                        {proofPath ? (
                            <div className="border-input flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                                <Check className="h-4 w-4 flex-shrink-0 text-green-500" />
                                <span className="min-w-0 flex-1 truncate text-xs">{proofPath.split("/").pop()}</span>
                                <button
                                    type="button"
                                    onClick={() => setProofPath(null)}
                                    className="text-muted-foreground hover:text-destructive flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={pickProof}
                                className="border-input bg-background hover:bg-muted/50 inline-flex h-9 w-full items-center gap-2 rounded-md border px-3 text-sm"
                            >
                                <Paperclip className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                <span className="text-muted-foreground">{t("payments.proof")}</span>
                            </button>
                        )}
                    </div>

                    {error ? <p className="text-destructive text-sm">{error}</p> : null}

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="border-input bg-background hover:bg-accent inline-flex h-10 flex-1 items-center justify-center rounded-md border px-4 text-sm font-medium"
                        >
                            {t("common.cancel")}
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={loading}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 flex-1 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
                        >
                            {loading ? t("common.loading") : t("common.confirm")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

const inputCn = "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
const selectCn = "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
