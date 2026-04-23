import { useState } from "react"
import { InvoicesList } from "./invoices-list"
import { CreateInvoiceForm } from "./create-invoice-form"
import { InvoiceDetailModal } from "./invoice-detail-modal"
import type { Invoice } from "../../types/definitions"

type View = "list" | "create" | "edit"

export function InvoicesPage(): JSX.Element {
    const [view, setView] = useState<View>("list")
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
    const [listRefreshKey, setListRefreshKey] = useState(0)

    function handleSaved(): void {
        setView("list")
        setEditingInvoice(null)
        setListRefreshKey((k) => k + 1)
    }

    function handleEdit(invoice: Invoice): void {
        setSelectedInvoice(null)
        setEditingInvoice(invoice)
        setView("edit")
    }

    function handleCancelForm(): void {
        setView("list")
        setEditingInvoice(null)
    }

    return (
        <>
            {view === "list" ? (
                <InvoicesList
                    refreshKey={listRefreshKey}
                    onNew={() => setView("create")}
                    onSelect={(inv) => setSelectedInvoice(inv)}
                />
            ) : view === "create" ? (
                <CreateInvoiceForm
                    onSaved={handleSaved}
                    onCancel={handleCancelForm}
                />
            ) : (
                <CreateInvoiceForm
                    invoice={editingInvoice ?? undefined}
                    onSaved={handleSaved}
                    onCancel={handleCancelForm}
                />
            )}

            {selectedInvoice ? (
                <InvoiceDetailModal
                    invoice={selectedInvoice}
                    onClose={() => setSelectedInvoice(null)}
                    onUpdated={(updated) => {
                        setSelectedInvoice(updated)
                        setListRefreshKey((k) => k + 1)
                    }}
                    onEdit={handleEdit}
                />
            ) : null}
        </>
    )
}
