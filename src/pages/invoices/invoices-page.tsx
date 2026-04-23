import { useState } from "react"
import { InvoicesList } from "./invoices-list"
import { CreateInvoiceForm } from "./create-invoice-form"
import { InvoiceDetailModal } from "./invoice-detail-modal"
import type { Invoice, InvoiceLine } from "../../types/definitions"

type View = "list" | "create" | "edit"

export function InvoicesPage(): JSX.Element {
    const [view, setView] = useState<View>("list")
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
    const [selectedLines, setSelectedLines] = useState<InvoiceLine[]>([])
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
    const [editingLines, setEditingLines] = useState<InvoiceLine[]>([])
    const [listRefreshKey, setListRefreshKey] = useState(0)

    function handleSaved(): void {
        setView("list")
        setEditingInvoice(null)
        setEditingLines([])
        setListRefreshKey((k) => k + 1)
    }

    function handleEdit(invoice: Invoice, lines: InvoiceLine[]): void {
        setSelectedInvoice(null)
        setSelectedLines([])
        setEditingInvoice(invoice)
        setEditingLines(lines)
        setView("edit")
    }

    function handleCancelForm(): void {
        setView("list")
        setEditingInvoice(null)
        setEditingLines([])
    }

    async function handleSelectInvoice(inv: Invoice): Promise<void> {
        const res = await window.api.getInvoice(inv.id)
        if (res.success && res.data) {
            const { invoice, lines } = res.data as { invoice: Invoice; lines: InvoiceLine[] }
            setSelectedInvoice(invoice)
            setSelectedLines(lines)
        }
    }

    return (
        <>
            {view === "list" ? (
                <InvoicesList
                    refreshKey={listRefreshKey}
                    onNew={() => setView("create")}
                    onSelect={handleSelectInvoice}
                />
            ) : view === "create" ? (
                <CreateInvoiceForm
                    onSaved={handleSaved}
                    onCancel={handleCancelForm}
                />
            ) : (
                <CreateInvoiceForm
                    invoice={editingInvoice ?? undefined}
                    invoiceLines={editingLines}
                    onSaved={handleSaved}
                    onCancel={handleCancelForm}
                />
            )}

            {selectedInvoice ? (
                <InvoiceDetailModal
                    invoice={selectedInvoice}
                    lines={selectedLines}
                    onClose={() => { setSelectedInvoice(null); setSelectedLines([]) }}
                    onUpdated={(updated, lines) => {
                        setSelectedInvoice(updated)
                        setSelectedLines(lines)
                        setListRefreshKey((k) => k + 1)
                    }}
                    onEdit={handleEdit}
                />
            ) : null}
        </>
    )
}
