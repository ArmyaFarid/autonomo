import { useEffect } from "react"
import { useAtom, useSetAtom } from "jotai"
import { useTranslation } from "react-i18next"
import { profileAtom, isFirstLaunchAtom, appReadyAtom, backupToastAtom, isLockedAtom } from "./store/profileAtom"
import { FirstLaunchPage } from "./pages/first-launch/first-launch-page"
import { MainLayout } from "./components/shared/main-layout"
import { LockScreen } from "./pages/lock/lock-screen"
import i18n from "./lib/i18n"

export function App(): JSX.Element {
    const { i18n: i18nInstance } = useTranslation()
    const [profile, setProfile] = useAtom(profileAtom)
    const [isFirstLaunch, setIsFirstLaunch] = useAtom(isFirstLaunchAtom)
    const [appReady, setAppReady] = useAtom(appReadyAtom)
    const setBackupToast = useSetAtom(backupToastAtom)
    const [isLocked, setIsLocked] = useAtom(isLockedAtom)

    useEffect(() => {
        async function init(): Promise<void> {
            const firstLaunchRes = await window.api.isFirstLaunch()
            if (firstLaunchRes.success && firstLaunchRes.data === true) {
                setIsFirstLaunch(true)
                setAppReady(true)
                return
            }

            const profileRes = await window.api.getProfile()
            if (profileRes.success && profileRes.data) {
                setProfile(profileRes.data)
                const locale = profileRes.data.locale ?? "fr"
                const lang = locale.startsWith("en") ? "en" : "fr"
                await i18nInstance.changeLanguage(lang)
                if (profileRes.data.appPin) setIsLocked(true)
            }

            setAppReady(true)

            // Auto-backup check runs after UI is ready so it doesn't block startup
            const backupRes = await window.api.checkAutoBackup()
            if (backupRes.success && (backupRes.data as { created: boolean }).created) {
                setBackupToast("backup.autoCreated")
            }
        }

        init().catch((err) => {
            console.error("App init failed:", err)
            setAppReady(true)
        })
    }, [])

    if (!appReady) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="text-muted-foreground text-sm">Chargement...</div>
            </div>
        )
    }

    if (isLocked) {
        return <LockScreen onUnlock={() => setIsLocked(false)} touchIdEnabled={!!profile?.touchIdEnabled} />
    }

    if (isFirstLaunch) {
        return (
            <FirstLaunchPage
                onComplete={(newProfile) => {
                    setProfile(newProfile)
                    setIsFirstLaunch(false)
                }}
            />
        )
    }

    return <MainLayout />
}
