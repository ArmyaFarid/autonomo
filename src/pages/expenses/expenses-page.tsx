import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react"
import { useAtomValue } from "jotai"
import { profileAtom } from "../../store/profileAtom"
import { formatDate, cn } from "../../lib/utils"
import type { Expense, ExpenseCategory } from "../../types/definitions"
import { ExpenseFormModal } from "./expense-form-modal"
import { DeleteExpenseDialog } from "./delete-expense-dialog"

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

function getAvailableYears(): number[] {
    const current = new Date().getFullYear()
    return [current, current - 1, current - 2]
}

function getMonthName(month: number, locale: string): string {
    return new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, month - 1, 1))
}

export function ExpensesPage(): JSX.Element {
    const { t } = useTranslation()
    const profile = useAtomValue(profileAtom)
    const locale = profile?.locale ?? "fr-CA"

    const [expenses, setExpenses] = useState<Expense[]>([])
    const [loading, setLoading] = useState(true)
    const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear())
    const [filterMonth, setFilterMonth] = useState<number>(0)
    const [filterCategory, setFilterCategory] = useState<string>("")

    const [showForm, setShowForm] = useState(false)
    const [editExpense, setEditExpense] = useState<Expense | null>(null)
    const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null)

    async function loadExpenses(): Promise<void> {
        setLoading(true)
        const result = await window.api.getExpenses()
        if (result.success && result.data) {
            setExpenses(result.data as Expense[])
        }
        setLoading(false)
    }

    useEffect(() => {
        loadExpenses()
    }, [])

    const filtered = expenses.filter((e) => {
        if (filterYear && e.year !== filterYear) return false
        if (filterMonth && parseInt(e.date.split("-")[1], 10) !== filterMonth) return false
        if (filterCategory && e.category !== filterCategory) return false
        return true
    })

    const totalAmount = filtered.reduce((sum, e) => sum + e.amount, 0)
    const totalDeductible = filtered.reduce((sum, e) => sum + e.amount * e.deductibleRate, 0)

    const fmt = (n: number): string =>
        locale.startsWith("en") ? `$${n.toFixed(2)}` : `${n.toFixed(2).replace(".", ",")} $`

    function openCreate(): void {
        setEditExpense(null)
        setShowForm(true)
    }

    function openEdit(expense: Expense): void {
        setEditExpense(expense)
        setShowForm(true)
    }

    function handleSaved(): void {
        setShowForm(false)
        setEditExpense(null)
        loadExpenses()
    }

    function handleDeleted(): void {
        setDeleteExpense(null)
        loadExpenses()
    }

    async function openReceipt(path: string): Promise<void> {
        await window.api.openPath(path)
    }

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-8 py-5">
                <h2 className="text-2xl font-semibold">{t("expenses.title")}</h2>
                <button
                    onClick={openCreate}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium"
                >
                    <Plus className="h-4 w-4" />
                    {t("expenses.new")}
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 border-b px-8 py-3">
                <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(Number(e.target.value))}
                    className={filterSelectCn}
                >
                    {getAvailableYears().map((y) => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>

                <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(Number(e.target.value))}
                    className={filterSelectCn}
                >
                    <option value={0}>{t("expenses.filterAllMonths")}</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                            {getMonthName(m, locale)}
                        </option>
                    ))}
                </select>

                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className={filterSelectCn}
                >
                    <option value="">{t("expenses.filterAllCategories")}</option>
                    {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{t(`expenses.categories.${c}`)}</option>
                    ))}
                </select>
            </div>

            {/* Summary bar */}
            <div className="flex gap-8 border-b bg-muted/30 px-8 py-3 text-sm">
                <div>
                    <span className="text-muted-foreground">{t("expenses.totalAmount")} : </span>
                    <span className="font-semibold">{fmt(totalAmount)}</span>
                </div>
                <div>
                    <span className="text-muted-foreground">{t("expenses.totalDeductible")} : </span>
                    <span className="font-semibold">{fmt(totalDeductible)}</span>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto px-8 py-4">
                {loading ? (
                    <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
                ) : filtered.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t("expenses.noExpenses")}</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b text-left">
                                <th className="pb-2 pr-4 font-medium text-muted-foreground">{t("expenses.date")}</th>
                                <th className="pb-2 pr-4 font-medium text-muted-foreground">{t("expenses.description")}</th>
                                <th className="pb-2 pr-4 font-medium text-muted-foreground">{t("expenses.category")}</th>
                                <th className="pb-2 pr-4 text-right font-medium text-muted-foreground">{t("expenses.amount")}</th>
                                <th className="pb-2 pr-4 text-right font-medium text-muted-foreground">{t("expenses.deductibleAmount")}</th>
                                <th className="pb-2 font-medium text-muted-foreground">{t("common.actions")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filtered.map((expense) => (
                                <tr key={expense.id} className="hover:bg-muted/30">
                                    <td className="py-3 pr-4 tabular-nums">
                                        {formatDate(expense.date, locale)}
                                    </td>
                                    <td className="py-3 pr-4">
                                        <p>{expense.description}</p>
                                        {expense.notes ? (
                                            <p className="text-muted-foreground text-xs">{expense.notes}</p>
                                        ) : null}
                                    </td>
                                    <td className="py-3 pr-4">
                                        <span className={cn(
                                            "inline-block rounded px-2 py-0.5 text-xs font-medium",
                                            expense.category === "business_meals"
                                                ? "bg-amber-100 text-amber-800"
                                                : "bg-muted text-muted-foreground"
                                        )}>
                                            {t(`expenses.categories.${expense.category}`)}
                                        </span>
                                    </td>
                                    <td className="py-3 pr-4 text-right tabular-nums">
                                        {fmt(expense.amount)}
                                    </td>
                                    <td className="py-3 pr-4 text-right tabular-nums">
                                        {expense.deductibleRate < 1 ? (
                                            <span className="text-amber-700">
                                                {fmt(expense.amount * expense.deductibleRate)}
                                            </span>
                                        ) : (
                                            fmt(expense.amount * expense.deductibleRate)
                                        )}
                                    </td>
                                    <td className="py-3">
                                        <div className="flex items-center gap-1">
                                            {expense.receiptPath ? (
                                                <button
                                                    onClick={() => openReceipt(expense.receiptPath!)}
                                                    title={t("expenses.viewReceipt")}
                                                    className="text-muted-foreground hover:text-foreground rounded p-1"
                                                >
                                                    <ExternalLink className="h-4 w-4" />
                                                </button>
                                            ) : (
                                                <span className="inline-block w-6" />
                                            )}
                                            <button
                                                onClick={() => openEdit(expense)}
                                                title={t("common.edit")}
                                                className="text-muted-foreground hover:text-foreground rounded p-1"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteExpense(expense)}
                                                title={t("common.delete")}
                                                className="text-muted-foreground hover:text-destructive rounded p-1"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {showForm ? (
                <ExpenseFormModal
                    expense={editExpense ?? undefined}
                    onClose={() => { setShowForm(false); setEditExpense(null) }}
                    onSaved={handleSaved}
                />
            ) : null}

            {deleteExpense ? (
                <DeleteExpenseDialog
                    expense={deleteExpense}
                    onClose={() => setDeleteExpense(null)}
                    onDeleted={handleDeleted}
                />
            ) : null}
        </div>
    )
}

const filterSelectCn = "border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
