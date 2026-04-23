import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
    LayoutDashboard,
    Users,
    FileText,
    Receipt,
    BarChart3,
    Settings,
} from "lucide-react"
import { cn } from "../../lib/utils"
import { useSetAtom } from "jotai"
import { clientsAtom } from "../../store/clientsAtom"
import type { Client } from "../../types/definitions"
import { DashboardPage } from "../../pages/dashboard/dashboard-page"
import { ClientsPage } from "../../pages/clients/clients-page"
import { InvoicesPage } from "../../pages/invoices/invoices-page"
import { ExpensesPage } from "../../pages/expenses/expenses-page"
import { ReportsPage } from "../../pages/reports/reports-page"
import { SettingsPage } from "../../pages/settings/settings-page"

type NavItem = {
    key: string
    labelKey: string
    icon: React.ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
    { key: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
    { key: "clients", labelKey: "nav.clients", icon: Users },
    { key: "invoices", labelKey: "nav.invoices", icon: FileText },
    { key: "expenses", labelKey: "nav.expenses", icon: Receipt },
    { key: "reports", labelKey: "nav.reports", icon: BarChart3 },
    { key: "settings", labelKey: "nav.settings", icon: Settings },
]

export function MainLayout(): JSX.Element {
    const { t } = useTranslation()
    const [activePage, setActivePage] = useState("dashboard")
    const setClients = useSetAtom(clientsAtom)

    useEffect(() => {
        window.api.getClients().then((res) => {
            if (res.success && res.data) setClients(res.data as Client[])
        })
    }, [])

    function renderPage(): JSX.Element {
        switch (activePage) {
            case "dashboard":
                return <DashboardPage />
            case "clients":
                return <ClientsPage />
            case "invoices":
                return <InvoicesPage />
            case "expenses":
                return <ExpensesPage />
            case "reports":
                return <ReportsPage />
            case "settings":
                return <SettingsPage />
            default:
                return <DashboardPage />
        }
    }

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <aside className="bg-card border-border flex w-56 flex-col border-r">
                <div className="border-border border-b px-4 py-5">
                    <h1 className="text-primary text-sm font-bold tracking-wide uppercase">
                        Armya Facturation
                    </h1>
                </div>

                <nav className="flex-1 space-y-0.5 p-2 pt-3">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon
                        const isActive = activePage === item.key
                        return (
                            <button
                                key={item.key}
                                onClick={() => setActivePage(item.key)}
                                className={cn(
                                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                )}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                {t(item.labelKey)}
                            </button>
                        )
                    })}
                </nav>
            </aside>

            <main className="flex-1 overflow-auto">
                {renderPage()}
            </main>
        </div>
    )
}
