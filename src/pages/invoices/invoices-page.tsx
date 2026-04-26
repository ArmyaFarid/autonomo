import { useState } from "react"
import { InvoicesList } from "./invoices-list"
import { CreateInvoiceForm } from "./create-invoice-form"
import { ImportInvoiceForm } from "./import-invoice-form"
import { InvoiceDetailModal } from "./invoice-detail-modal"
import { InvoiceNewChoice } from "./invoice-new-choice"
import { InvoiceSplitEditor } from "./editor/invoice-split-editor"
import { InvoiceInlineEditor } from "./editor/invoice-inline-editor"
import type { Invoice, InvoiceLine } from "../../types/definitions"

type View = "list" | "choose" | "create" | "edit" | "import" | "editor-split" | "editor-inline"

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

    function renderMain(): JSX.Element {
        switch (view) {
            case "choose":
                return (
                    <InvoiceNewChoice
                        onBack={() => setView("list")}
                        onForm={() => setView("create")}
                        onSplitView={() => setView("editor-split")}
                        onInline={() => setView("editor-inline")}
                    />
                )
            case "create":
                return (
                    <CreateInvoiceForm
                        onSaved={handleSaved}
                        onCancel={() => setView("choose")}
                    />
                )
            case "edit":
                return (
                    <CreateInvoiceForm
                        invoice={editingInvoice ?? undefined}
                        invoiceLines={editingLines}
                        onSaved={handleSaved}
                        onCancel={handleCancelForm}
                    />
                )
            case "import":
                return (
                    <ImportInvoiceForm
                        onSaved={handleSaved}
                        onCancel={handleCancelForm}
                    />
                )
            case "editor-split":
                return <InvoiceSplitEditor onBack={() => setView("choose")} />
            case "editor-inline":
                return <InvoiceInlineEditor onBack={() => setView("choose")} />
            default:
                return (
                    <InvoicesList
                        refreshKey={listRefreshKey}
                        onNew={() => setView("choose")}
                        onImport={() => setView("import")}
                        onSelect={handleSelectInvoice}
                    />
                )
        }
    }

    return (
        <>
            {renderMain()}

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
