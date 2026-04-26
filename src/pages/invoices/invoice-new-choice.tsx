import { useTranslation } from "react-i18next"
import { ChevronLeft, Columns2, FileText, PencilLine } from "lucide-react"

interface InvoiceNewChoiceProps {
    onBack: () => void
    onForm: () => void
    onSplitView: () => void
    onInline: () => void
}

export function InvoiceNewChoice({ onBack, onForm, onSplitView, onInline }: InvoiceNewChoiceProps): JSX.Element {
    const { t } = useTranslation()

    return (
        <div className="mx-auto max-w-3xl p-8">
            <div className="mb-8 flex items-center gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="text-muted-foreground hover:text-foreground rounded p-1"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div>
                    <h2 className="text-2xl font-semibold">{t("invoices.new")}</h2>
                    <p className="text-muted-foreground mt-0.5 text-sm">Choisissez votre mode de saisie.</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-5">
                <ChoiceCard
                    icon={<FileText className="h-8 w-8" />}
                    title="Formulaire"
                    description="Saisie classique. Activez la prévisualisation en direct depuis le formulaire."
                    badge={null}
                    onClick={onForm}
                />
                <ChoiceCard
                    icon={<Columns2 className="h-8 w-8" />}
                    title="Vue divisée"
                    description="Formulaire à gauche, aperçu de la facture en temps réel à droite."
                    badge="Option A"
                    onClick={onSplitView}
                />
                <ChoiceCard
                    icon={<PencilLine className="h-8 w-8" />}
                    title="Édition inline"
                    description="Cliquez directement sur les champs de la facture pour les modifier."
                    badge="Option B"
                    onClick={onInline}
                />
            </div>
        </div>
    )
}

interface ChoiceCardProps {
    icon: React.ReactNode
    title: string
    description: string
    badge: string | null
    onClick: () => void
}

const ChoiceCard: React.FC<ChoiceCardProps> = ({ icon, title, description, badge, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="border-border hover:border-primary hover:bg-accent group relative flex flex-col items-start gap-4 rounded-xl border-2 p-6 text-left transition-all"
    >
        {badge ? (
            <span className="bg-primary/10 text-primary absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                {badge}
            </span>
        ) : null}
        <div className="bg-primary/10 group-hover:bg-primary/20 rounded-full p-3 transition-colors">
            <span className="text-primary">{icon}</span>
        </div>
        <div>
            <p className="font-semibold">{title}</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{description}</p>
        </div>
    </button>
)
