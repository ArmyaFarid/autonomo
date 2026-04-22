import { useState } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import type { Client } from "../../types/definitions"

interface ArchiveClientDialogProps {
    client: Client
    onArchived: () => void
    onClose: () => void
}

export const ArchiveClientDialog: React.FC<ArchiveClientDialogProps> = ({ client, onArchived, onClose }) => {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    async function handleConfirm(): Promise<void> {
        setLoading(true)
        const result = await window.api.archiveClient(client.id)
        if (result.success) {
            onArchived()
        } else {
            setError(result.error ?? t("common.error"))
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background w-full max-w-md rounded-lg shadow-lg">
                <div className="flex items-center justify-between border-b px-6 py-4">
                    <h3 className="text-lg font-semibold">{t("clients.archive")}</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-6 py-5">
                    <p className="text-sm">
                        {t("clients.archiveConfirm", { name: client.name })}
                    </p>
                    {error ? <p className="text-destructive mt-3 text-sm">{error}</p> : null}
                </div>

                <div className="flex justify-end gap-3 border-t px-6 py-4">
                    <button
                        onClick={onClose}
                        className="border-input bg-background hover:bg-accent inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
                    >
                        {loading ? t("common.loading") : t("clients.archive")}
                    </button>
                </div>
            </div>
        </div>
    )
}
