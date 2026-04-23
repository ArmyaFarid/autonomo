import { useState } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import type { Expense } from "../../types/definitions"

interface DeleteExpenseDialogProps {
    expense: Expense
    onClose: () => void
    onDeleted: () => void
}

export function DeleteExpenseDialog({ expense, onClose, onDeleted }: DeleteExpenseDialogProps): JSX.Element {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(false)

    async function handleDelete(): Promise<void> {
        setLoading(true)
        await window.api.deleteExpense(expense.id)
        setLoading(false)
        onDeleted()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background w-full max-w-md rounded-lg shadow-lg">
                <div className="flex items-center justify-between border-b px-6 py-4">
                    <h3 className="text-lg font-semibold">{t("expenses.deleteConfirm")}</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="px-6 py-5">
                    <p className="text-sm font-medium">{expense.description}</p>
                    <p className="text-muted-foreground mt-1 text-sm">{expense.amount.toFixed(2)} $</p>
                    <p className="text-muted-foreground mt-3 text-sm">{t("expenses.deleteDesc")}</p>
                </div>
                <div className="flex justify-end gap-3 border-t px-6 py-4">
                    <button
                        onClick={onClose}
                        className="border-input bg-background hover:bg-accent inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={loading}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
                    >
                        {loading ? t("common.loading") : t("common.delete")}
                    </button>
                </div>
            </div>
        </div>
    )
}
