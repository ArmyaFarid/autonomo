import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Pencil, Archive, Users } from "lucide-react"
import { useAtom } from "jotai"
import { clientsAtom } from "../../store/clientsAtom"
import { ClientFormModal } from "./client-form-modal"
import { ArchiveClientDialog } from "./archive-client-dialog"
import type { Client } from "../../types/definitions"
import { cn } from "../../lib/utils"

export function ClientsPage(): JSX.Element {
    const { t } = useTranslation()
    const [clients, setClients] = useAtom(clientsAtom)
    const [loading, setLoading] = useState(true)
    const [showArchived, setShowArchived] = useState(false)
    const [formOpen, setFormOpen] = useState(false)
    const [editClient, setEditClient] = useState<Client | null>(null)
    const [archiveTarget, setArchiveTarget] = useState<Client | null>(null)

    async function loadClients(): Promise<void> {
        const result = await window.api.getClients()
        if (result.success && result.data) {
            setClients(result.data as Client[])
        }
        setLoading(false)
    }

    useEffect(() => {
        loadClients()
    }, [])

    function openCreate(): void {
        setEditClient(null)
        setFormOpen(true)
    }

    function openEdit(client: Client): void {
        setEditClient(client)
        setFormOpen(true)
    }

    function handleSaved(): void {
        setFormOpen(false)
        loadClients()
    }

    function handleArchived(): void {
        setArchiveTarget(null)
        loadClients()
    }

    const visible = clients.filter((c) => (showArchived ? c.active === 0 : c.active === 1))

    const frequencyLabel = (f: string): string => {
        if (f === "biweekly") return t("clients.frequencyBiweekly")
        if (f === "monthly") return t("clients.frequencyMonthly")
        return t("clients.frequencyOneTime")
    }

    return (
        <div className="p-8">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold">{t("clients.title")}</h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {clients.filter((c) => c.active === 1).length} {t("clients.active").toLowerCase()}
                        {" · "}
                        {clients.filter((c) => c.active === 0).length} {t("clients.archived").toLowerCase()}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowArchived((v) => !v)}
                        className={cn(
                            "border-input hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm",
                            showArchived && "bg-accent"
                        )}
                    >
                        <Archive className="h-4 w-4" />
                        {t("clients.archived")}
                    </button>
                    <button
                        onClick={openCreate}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium"
                    >
                        <Plus className="h-4 w-4" />
                        {t("clients.new")}
                    </button>
                </div>
            </div>

            {loading ? (
                <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
            ) : visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <Users className="text-muted-foreground mb-4 h-12 w-12" />
                    <p className="text-muted-foreground text-sm">{t("common.noData")}</p>
                    {!showArchived ? (
                        <button
                            onClick={openCreate}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4 inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium"
                        >
                            <Plus className="h-4 w-4" />
                            {t("clients.new")}
                        </button>
                    ) : null}
                </div>
            ) : (
                <div className="rounded-md border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50">
                                <th className="px-4 py-3 text-left font-medium">{t("clients.name")}</th>
                                <th className="px-4 py-3 text-left font-medium">{t("clients.company")}</th>
                                <th className="px-4 py-3 text-left font-medium">{t("clients.email")}</th>
                                <th className="px-4 py-3 text-left font-medium">{t("clients.billingType")}</th>
                                <th className="px-4 py-3 text-left font-medium">{t("clients.frequency")}</th>
                                <th className="px-4 py-3 text-right font-medium">{t("common.actions")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((client) => (
                                <tr key={client.id} className="border-b last:border-0 hover:bg-muted/30">
                                    <td className="px-4 py-3 font-medium">{client.name}</td>
                                    <td className="text-muted-foreground px-4 py-3">{client.companyName ?? "—"}</td>
                                    <td className="text-muted-foreground px-4 py-3">{client.email ?? "—"}</td>
                                    <td className="px-4 py-3">
                                        <span className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs">
                                            {client.billingType === "hourly"
                                                ? t("clients.billingTypeHourly")
                                                : t("clients.billingTypeFixed")}
                                        </span>
                                    </td>
                                    <td className="text-muted-foreground px-4 py-3">
                                        {frequencyLabel(client.billingFrequency)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => openEdit(client)}
                                                className="text-muted-foreground hover:text-foreground rounded p-1"
                                                title={t("common.edit")}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            {client.active === 1 ? (
                                                <button
                                                    onClick={() => setArchiveTarget(client)}
                                                    className="text-muted-foreground hover:text-foreground rounded p-1"
                                                    title={t("clients.archive")}
                                                >
                                                    <Archive className="h-4 w-4" />
                                                </button>
                                            ) : null}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {formOpen ? (
                <ClientFormModal
                    client={editClient}
                    onSaved={handleSaved}
                    onClose={() => setFormOpen(false)}
                />
            ) : null}

            {archiveTarget ? (
                <ArchiveClientDialog
                    client={archiveTarget}
                    onArchived={handleArchived}
                    onClose={() => setArchiveTarget(null)}
                />
            ) : null}
        </div>
    )
}
