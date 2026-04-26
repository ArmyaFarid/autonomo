import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CheckCircle, FileArchive, Plus, Shield } from "lucide-react"
import type { Profile } from "../../types/definitions"

interface FirstLaunchPageProps {
    onComplete: (profile: Profile) => void
}

type Step = "choice" | "setup" | "pin" | "restored"

const profileSchema = z.object({
    name: z.string().min(1),
    address: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    defaultHourlyRate: z.coerce.number().min(0),
    locale: z.enum(["fr-CA", "en-CA"]),
})

type ProfileFormValues = z.infer<typeof profileSchema>

const inputCn =
    "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"

export function FirstLaunchPage({ onComplete }: FirstLaunchPageProps): JSX.Element {
    const { t, i18n } = useTranslation()
    const [step, setStep] = useState<Step>("choice")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [savedProfile, setSavedProfile] = useState<Profile | null>(null)
    const [pinValue, setPinValue] = useState("")
    const [pinConfirm, setPinConfirm] = useState("")
    const [pinError, setPinError] = useState("")

    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            name: "",
            address: "",
            phone: "",
            email: "",
            defaultHourlyRate: 23,
            locale: "fr-CA",
        },
    })

    async function handleRestoreBackup(): Promise<void> {
        const fileResult = await window.api.openFileDialog({
            filters: [{ name: "Backup", extensions: ["zip"] }],
            properties: ["openFile"],
        })
        if (!fileResult.success) {
            setError(fileResult.error ?? t("common.error"))
            return
        }
        if (!fileResult.data) return

        setLoading(true)
        setError("")
        const restoreResult = await window.api.restoreBackup(fileResult.data[0])
        if (restoreResult.success) {
            setStep("restored")
        } else {
            setError(restoreResult.error ?? t("common.error"))
        }
        setLoading(false)
    }

    async function handleSubmit(values: ProfileFormValues): Promise<void> {
        setLoading(true)
        setError("")
        const lang = values.locale.startsWith("en") ? "en" : "fr"
        await i18n.changeLanguage(lang)

        const result = await window.api.saveProfile(values)
        if (result.success && result.data) {
            setSavedProfile(result.data as Profile)
            setStep("pin")
        } else {
            setError(result.error ?? t("common.error"))
        }
        setLoading(false)
    }

    function handleSkipPin(): void {
        if (savedProfile) onComplete(savedProfile)
    }

    async function handleSetupPin(): Promise<void> {
        if (pinValue.length < 4) { setPinError(t("security.pinTooShort")); return }
        if (pinValue !== pinConfirm) { setPinError(t("security.pinMismatch")); return }
        setLoading(true)
        const result = await window.api.setPin(pinValue)
        if (result.success && result.data) {
            onComplete(result.data as Profile)
        } else {
            setPinError(result.error ?? t("common.error"))
        }
        setLoading(false)
    }

    if (step === "restored") {
        return (
            <div className="flex h-screen items-center justify-center bg-background p-8">
                <div className="w-full max-w-sm space-y-6 text-center">
                    <div className="flex flex-col items-center gap-3">
                        <div className="rounded-full bg-green-100 p-4">
                            <CheckCircle className="h-8 w-8 text-green-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold">{t("backup.restored")}</h1>
                            <p className="text-muted-foreground mt-1 text-sm">{t("backup.restoredDesc")}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => window.api.reloadWindow()}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium"
                    >
                        {t("firstLaunch.relaunch")}
                    </button>
                </div>
            </div>
        )
    }

    if (step === "pin") {
        return (
            <div className="flex h-screen items-center justify-center bg-background p-8">
                <div className="w-full max-w-sm space-y-6">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="bg-primary/10 rounded-full p-4">
                            <Shield className="text-primary h-8 w-8" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold">{t("setup.pinTitle")}</h1>
                            <p className="text-muted-foreground mt-1 text-sm">{t("setup.pinSubtitle")}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">{t("security.newPin")}</label>
                            <input
                                type="password"
                                inputMode="numeric"
                                value={pinValue}
                                onChange={(e) => { setPinValue(e.target.value.replace(/\D/g, "")); setPinError("") }}
                                className={inputCn}
                                placeholder={t("security.pinPlaceholder")}
                                autoComplete="new-password"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">{t("security.confirmPin")}</label>
                            <input
                                type="password"
                                inputMode="numeric"
                                value={pinConfirm}
                                onChange={(e) => { setPinConfirm(e.target.value.replace(/\D/g, "")); setPinError("") }}
                                className={inputCn}
                                placeholder={t("security.pinPlaceholder")}
                                autoComplete="new-password"
                            />
                        </div>
                        {pinError ? <p className="text-destructive text-sm">{pinError}</p> : null}
                    </div>

                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={handleSetupPin}
                            disabled={loading}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-medium disabled:opacity-50"
                        >
                            {loading ? t("common.loading") : t("setup.finish")}
                        </button>
                        <button
                            type="button"
                            onClick={handleSkipPin}
                            disabled={loading}
                            className="text-muted-foreground hover:text-foreground inline-flex h-10 w-full items-center justify-center rounded-md text-sm disabled:opacity-50"
                        >
                            {t("setup.pinSkip")}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (step === "setup") {
        return (
            <div className="flex h-screen items-center justify-center bg-background p-8">
                <div className="w-full max-w-lg space-y-6">
                    <div>
                        <h1 className="text-2xl font-semibold">{t("setup.title")}</h1>
                        <p className="text-muted-foreground mt-1 text-sm">{t("setup.subtitle")}</p>
                    </div>

                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">{t("setup.name")} *</label>
                            <input
                                {...form.register("name")}
                                placeholder={t("setup.namePlaceholder")}
                                className={inputCn}
                            />
                            {form.formState.errors.name ? (
                                <p className="text-destructive text-xs">{t("setup.required")}</p>
                            ) : null}
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">{t("setup.address")} *</label>
                            <textarea
                                {...form.register("address")}
                                rows={3}
                                placeholder={t("setup.addressPlaceholder")}
                                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                            />
                            {form.formState.errors.address ? (
                                <p className="text-destructive text-xs">{t("setup.required")}</p>
                            ) : null}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium">{t("setup.phone")}</label>
                                <input {...form.register("phone")} className={inputCn} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">{t("setup.email")}</label>
                                <input {...form.register("email")} type="email" className={inputCn} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium">{t("setup.hourlyRate")}</label>
                                <input
                                    {...form.register("defaultHourlyRate")}
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    className={inputCn}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">{t("setup.locale")}</label>
                                <select
                                    {...form.register("locale")}
                                    className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                                >
                                    <option value="fr-CA">{t("setup.localeFr")}</option>
                                    <option value="en-CA">{t("setup.localeEn")}</option>
                                </select>
                            </div>
                        </div>

                        {error ? <p className="text-destructive text-sm">{error}</p> : null}

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setStep("choice")}
                                className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
                            >
                                {t("common.back")}
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 flex-1 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
                            >
                                {loading ? t("common.loading") : t("setup.save")}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-screen items-center justify-center bg-background p-8">
            <div className="w-full max-w-2xl space-y-8 text-center">
                <div>
                    <h1 className="text-3xl font-bold">{t("firstLaunch.title")}</h1>
                    <p className="text-muted-foreground mt-2">{t("firstLaunch.subtitle")}</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <button
                        onClick={() => setStep("setup")}
                        className="border-border hover:border-primary hover:bg-accent group flex flex-col items-center gap-4 rounded-xl border-2 p-8 text-left transition-all"
                    >
                        <div className="bg-primary/10 group-hover:bg-primary/20 rounded-full p-4 transition-colors">
                            <Plus className="text-primary h-8 w-8" />
                        </div>
                        <div>
                            <p className="font-semibold">{t("firstLaunch.newInstall")}</p>
                            <p className="text-muted-foreground mt-1 text-sm">{t("firstLaunch.newInstallDesc")}</p>
                        </div>
                    </button>

                    <button
                        onClick={handleRestoreBackup}
                        disabled={loading}
                        className="border-border hover:border-primary hover:bg-accent group flex flex-col items-center gap-4 rounded-xl border-2 p-8 text-left transition-all disabled:opacity-50"
                    >
                        <div className="bg-primary/10 group-hover:bg-primary/20 rounded-full p-4 transition-colors">
                            <FileArchive className="text-primary h-8 w-8" />
                        </div>
                        <div>
                            <p className="font-semibold">{t("firstLaunch.restore")}</p>
                            <p className="text-muted-foreground mt-1 text-sm">{t("firstLaunch.restoreDesc")}</p>
                        </div>
                    </button>
                </div>

                {error ? <p className="text-destructive text-sm">{error}</p> : null}
            </div>
        </div>
    )
}
