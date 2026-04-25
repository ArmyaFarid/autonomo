import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { X, Paperclip, Check, ExternalLink, Trash2 } from "lucide-react"
import { toIsoDate } from "../../lib/utils"
import type { Expense, ExpenseCategory } from "../../types/definitions"

const CATEGORIES: ExpenseCategory[] = [
    "office_supplies",
    "telecom",
    "transport",
    "training",
    "equipment",
    "business_meals",
    "home_office",
    "software",
    "hosting",
    "domains",
    "api_credits",
    "other",
]

const expenseSchema = z.object({
    date: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
    amount: z.coerce.number().min(0.01),
    gstPaid: z.coerce.number().min(0),
    qstPaid: z.coerce.number().min(0),
    notes: z.string().optional(),
})

type ExpenseFormValues = z.infer<typeof expenseSchema>

interface ExpenseFormModalProps {
    expense?: Expense
    onClose: () => void
    onSaved: () => void
}

export function ExpenseFormModal({ expense, onClose, onSaved }: ExpenseFormModalProps): JSX.Element {
    const { t } = useTranslation()
    const editMode = !!expense

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [receiptSourcePath, setReceiptSourcePath] = useState<string | null>(null)
    const [existingReceiptPath, setExistingReceiptPath] = useState<string | null>(expense?.receiptPath ?? null)
    // True when the purchase includes Quebec TPS+TVQ — auto-calculates from total
    const [taxesIncluded, setTaxesIncluded] = useState(
        editMode ? (expense!.gstPaid > 0 || expense!.qstPaid > 0) : true
    )

    const form = useForm<ExpenseFormValues>({
        resolver: zodResolver(expenseSchema),
        defaultValues: {
            date: expense?.date ?? toIsoDate(new Date()),
            description: expense?.description ?? "",
            category: expense?.category ?? "",
            amount: expense?.amount ?? 0,
            gstPaid: expense?.gstPaid ?? 0,
            qstPaid: expense?.qstPaid ?? 0,
            notes: expense?.notes ?? "",
        },
    })

    const category = form.watch("category")
    const amount = form.watch("amount")

    // Auto-calculate TPS/TVQ when amount changes and taxes are included
    useEffect(() => {
        if (!taxesIncluded || !amount || amount <= 0) return
        const preTax = amount / 1.14975
        form.setValue("gstPaid", Math.round(preTax * 0.05 * 100) / 100)
        form.setValue("qstPaid", Math.round(preTax * 0.09975 * 100) / 100)
    }, [amount, taxesIncluded])

    function toggleTaxesIncluded(checked: boolean): void {
        setTaxesIncluded(checked)
        if (!checked) {
            form.setValue("gstPaid", 0)
            form.setValue("qstPaid", 0)
        }
    }

    async function handleDeleteReceipt(): Promise<void> {
        if (!expense?.id) return
        if (!confirm(t("expenses.deleteReceipt"))) return
        const result = await window.api.deleteExpenseReceipt(expense.id)
        if (result.success) {
            setExistingReceiptPath(null)
        } else {
            setError(result.error ?? t("common.error"))
        }
    }

    async function pickReceipt(): Promise<void> {
        const result = await window.api.openFileDialog({
            title: t("expenses.attachReceipt"),
            properties: ["openFile"],
            filters: [{ name: "Images & PDF", extensions: ["jpg", "jpeg", "png", "pdf"] }],
        })
        if (result.success && (result.data as string[])?.[0]) {
            setReceiptSourcePath((result.data as string[])[0])
        }
    }

    async function onSubmit(values: ExpenseFormValues): Promise<void> {
        setError("")
        setLoading(true)
        const year = parseInt(values.date.split("-")[0], 10)
        const deductibleRate = values.category === "business_meals" ? 0.5 : 1.0
        const payload = {
            date: values.date,
            description: values.description,
            category: values.category,
            amount: values.amount,
            gstPaid: values.gstPaid,
            qstPaid: values.qstPaid,
            notes: values.notes || null,
            deductibleRate,
            year,
        }

        const result = editMode
            ? await window.api.updateExpense(expense!.id, payload)
            : await window.api.createExpense(payload)

        if (!result.success) {
            setError(result.error ?? t("common.error"))
            setLoading(false)
            return
        }

        if (receiptSourcePath) {
            const saved = result.data as Expense
            await window.api.addExpenseReceipt({ expenseId: saved.id, sourcePath: receiptSourcePath })
        }

        setLoading(false)
        onSaved()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background w-full max-w-lg rounded-lg shadow-lg">
                <div className="flex items-center justify-between border-b px-6 py-4">
                    <h3 className="text-lg font-semibold">
                        {editMode ? t("expenses.edit") : t("expenses.new")}
                    </h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-6 py-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">{t("expenses.date")} *</label>
                            <input {...form.register("date")} type="date" className={inputCn} />
                            {form.formState.errors.date ? (
                                <p className="text-destructive text-xs">{form.formState.errors.date.message}</p>
                            ) : null}
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">{t("expenses.amount")} ($) *</label>
                            <input
                                {...form.register("amount")}
                                type="number"
                                min="0"
                                step="0.01"
                                className={inputCn}
                            />
                            {form.formState.errors.amount ? (
                                <p className="text-destructive text-xs">{form.formState.errors.amount.message}</p>
                            ) : null}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium">{t("expenses.description")} *</label>
                        <input {...form.register("description")} type="text" className={inputCn} />
                        {form.formState.errors.description ? (
                            <p className="text-destructive text-xs">{form.formState.errors.description.message}</p>
                        ) : null}
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium">{t("expenses.category")} *</label>
                        <select {...form.register("category")} className={selectCn}>
                            <option value="">{t("expenses.selectCategory")}</option>
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {t(`expenses.categories.${c}`)}
                                </option>
                            ))}
                        </select>
                        {form.formState.errors.category ? (
                            <p className="text-destructive text-xs">{form.formState.errors.category.message}</p>
                        ) : null}
                        {category === "business_meals" ? (
                            <p className="text-muted-foreground text-xs">{t("expenses.businessMealsNote")}</p>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={taxesIncluded}
                                onChange={(e) => toggleTaxesIncluded(e.target.checked)}
                                className="accent-primary"
                            />
                            {t("expenses.taxesIncluded")}
                        </label>
                        {taxesIncluded ? (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-muted-foreground text-sm">{t("expenses.gstPaid")} ($)</label>
                                    <input
                                        {...form.register("gstPaid")}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        readOnly={taxesIncluded}
                                        className={taxesIncluded ? readonlyCn : inputCn}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-muted-foreground text-sm">{t("expenses.qstPaid")} ($)</label>
                                    <input
                                        {...form.register("qstPaid")}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        readOnly={taxesIncluded}
                                        className={taxesIncluded ? readonlyCn : inputCn}
                                    />
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium">{t("expenses.notes")}</label>
                        <textarea {...form.register("notes")} rows={2} className={textareaCn} />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium">{t("expenses.receipt")}</label>
                        {existingReceiptPath && !receiptSourcePath ? (
                            <div className="border-input flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                                <Check className="h-4 w-4 flex-shrink-0 text-green-500" />
                                <span className="min-w-0 flex-1 truncate text-xs">
                                    {existingReceiptPath.split("/").pop()}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => window.api.openPath(existingReceiptPath)}
                                    className="text-muted-foreground hover:text-foreground flex h-7 w-7 flex-shrink-0 items-center justify-center rounded"
                                    title={t("expenses.viewReceipt")}
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeleteReceipt}
                                    className="text-muted-foreground hover:text-destructive flex h-7 w-7 flex-shrink-0 items-center justify-center rounded"
                                    title={t("expenses.deleteReceipt")}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ) : receiptSourcePath ? (
                            <div className="border-input flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                                <Check className="h-4 w-4 flex-shrink-0 text-green-500" />
                                <span className="min-w-0 flex-1 truncate text-xs">
                                    {receiptSourcePath.split("/").pop()}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setReceiptSourcePath(null)}
                                    className="text-muted-foreground hover:text-destructive flex h-7 w-7 flex-shrink-0 items-center justify-center rounded"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={pickReceipt}
                                className="border-input bg-background hover:bg-muted/50 inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm"
                            >
                                <Paperclip className="h-4 w-4" />
                                {t("expenses.attachReceipt")}
                            </button>
                        )}
                    </div>

                    {error ? <p className="text-destructive text-sm">{error}</p> : null}

                    <div className="flex justify-end gap-3 border-t pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="border-input bg-background hover:bg-accent inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
                        >
                            {t("common.cancel")}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
                        >
                            {loading ? t("common.loading") : t("common.save")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

const inputCn = "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
const readonlyCn = "border-input bg-muted text-muted-foreground flex h-10 w-full rounded-md border px-3 py-2 text-sm"
const selectCn = "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
const textareaCn = "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
