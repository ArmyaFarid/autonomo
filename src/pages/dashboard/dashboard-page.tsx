import { useTranslation } from "react-i18next"

export function DashboardPage(): JSX.Element {
    const { t } = useTranslation()
    return (
        <div className="p-8">
            <h2 className="text-2xl font-semibold">{t("dashboard.title")}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{t("common.noData")}</p>
        </div>
    )
}
