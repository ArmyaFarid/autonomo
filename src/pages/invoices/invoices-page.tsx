import { useState } from "react"
import { InvoicesList } from "./invoices-list"
import { CreateInvoiceForm } from "./create-invoice-form"
import { InvoiceDetailModal } from "./invoice-detail-modal"
import type { Invoice } from "../../types/definitions"

type View = "list" | "create"

export function InvoicesPage(): JSX.Element {
    const [view, setView] = useState<View>("list")
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
    const [listRefreshKey, setListRefreshKey] = useState(0)

    function handleCreated(): void {
        setView("list")
        setListRefreshKey((k) => k + 1)
    }

    return (
        <>
            {view === "list" ? (
                <InvoicesList
                    refreshKey={listRefreshKey}
                    onNew={() => setView("create")}
                    onSelect={(inv) => setSelectedInvoice(inv)}
                />
            ) : (
                <CreateInvoiceForm
                    onSaved={handleCreated}
                    onCancel={() => setView("list")}
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
                />
            ) : null}
        </>
    )
}
