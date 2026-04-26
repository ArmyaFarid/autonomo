import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useAtom } from "jotai"
import { Fingerprint, ImagePlus, Lock, LockOpen, Shield } from "lucide-react"
import { cn } from "../../lib/utils"
import { profileAtom } from "../../store/profileAtom"
import type { Profile } from "../../types/definitions"

const profileSchema = z.object({
    name: z.string().min(1),
    address: z.string().min(1),
    city: z.string().optional(),
    province: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    gstNumber: z.string().optional(),
    qstNumber: z.string().optional(),
    defaultHourlyRate: z.coerce.number().min(0),
    invoiceStartNumber: z.coerce.number().int().min(1),
    invoiceNumberFormat: z.string().min(1),
    locale: z.enum(["fr-CA", "en-CA"]),
    backupIntervalDays: z.coerce.number().int().min(1),
    backupRetentionCount: z.coerce.number().int().min(1),
    lateInvoiceAlertDays: z.coerce.number().int().min(1),
    taxReserveRate: z.coerce.number().min(0).max(100),
})

type ProfileFormValues = z.infer<typeof profileSchema>
type Tab = "profile" | "preferences" | "security"

export function SettingsPage(): JSX.Element {
    const { t, i18n } = useTranslation()
    const [profile, setProfile] = useAtom(profileAtom)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState("")
    const [logoPath, setLogoPath] = useState<string | null>(null)
    const [backingUp, setBackingUp] = useState(false)
    const [backupMsg, setBackupMsg] = useState("")
    const [restoring, setRestoring] = useState(false)
    const [restoreConfirm, setRestoreConfirm] = useState(false)
    const [activeTab, setActiveTab] = useState<Tab>("profile")

    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            name: "",
            address: "",
            city: "",
            province: "",
            country: "",
            postalCode: "",
            phone: "",
            email: "",
            gstNumber: "",
            qstNumber: "",
            defaultHourlyRate: 23,
            invoiceStartNumber: 1,
            invoiceNumberFormat: "YYYY-NNN",
            locale: "fr-CA",
            backupIntervalDays: 7,
            backupRetentionCount: 1,
            lateInvoiceAlertDays: 30,
            taxReserveRate: 20,
        },
    })

    useEffect(() => {
        if (profile) {
            form.reset({
                name: profile.name,
                address: profile.address,
                city: profile.city ?? "",
                province: profile.province ?? "",
                country: profile.country ?? "",
                postalCode: profile.postalCode ?? "",
                phone: profile.phone ?? "",
                email: profile.email ?? "",
                gstNumber: profile.gstNumber ?? "",
                qstNumber: profile.qstNumber ?? "",
                defaultHourlyRate: profile.defaultHourlyRate,
                invoiceStartNumber: profile.invoiceStartNumber,
                invoiceNumberFormat: profile.invoiceNumberFormat,
                locale: (profile.locale as "fr-CA" | "en-CA") ?? "fr-CA",
                backupIntervalDays: profile.backupIntervalDays,
                backupRetentionCount: profile.backupRetentionCount,
                lateInvoiceAlertDays: profile.lateInvoiceAlertDays,
                taxReserveRate: Math.round(profile.taxReserveRate * 100),
            })
            setLogoPath(profile.logoPath)
        }
    }, [profile])

    async function handleSubmit(values: ProfileFormValues): Promise<void> {
        setSaving(true)
        setSaved(false)
        setError("")

        const result = await window.api.saveProfile({
            ...values,
            taxReserveRate: values.taxReserveRate / 100,
            logoPath,
        })
        if (result.success && result.data) {
            setProfile(result.data as Profile)
            const lang = values.locale.startsWith("en") ? "en" : "fr"
            await i18n.changeLanguage(lang)
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
        } else {
            setError(result.error ?? t("common.error"))
        }
        setSaving(false)
    }

    async function handleUploadLogo(): Promise<void> {
        const result = await window.api.openFileDialog({
            filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "svg"] }],
            properties: ["openFile"],
        })
        if (result.success && result.data) {
            setLogoPath(result.data[0])
        }
    }

    async function handleRestoreBackup(): Promise<void> {
        const result = await window.api.openFileDialog({
            filters: [{ name: "Backup", extensions: ["zip"] }],
            properties: ["openFile"],
        })
        if (!result.success || !result.data) return
        setRestoring(true)
        setRestoreConfirm(false)
        const restoreResult = await window.api.restoreBackup(result.data[0])
        if (restoreResult.success) {
            setBackupMsg(t("backup.restoredDesc"))
            setTimeout(() => window.api.reloadWindow(), 1500)
        } else {
            setBackupMsg(restoreResult.error ?? t("common.error"))
            setRestoring(false)
        }
    }

    async function handleCreateBackup(): Promise<void> {
        setBackingUp(true)
        setBackupMsg("")
        const result = await window.api.createBackup()
        if (result.success) {
            setBackupMsg(t("backup.createdDesc"))
        } else {
            setBackupMsg(result.error ?? t("common.error"))
        }
        setBackingUp(false)
    }

    async function handleExportBackup(): Promise<void> {
        const date = new Date().toISOString().split("T")[0]
        const saveResult = await window.api.saveFileDialog({
            defaultPath: `armya-backup-${date}.zip`,
            filters: [{ name: "Backup", extensions: ["zip"] }],
        })
        if (!saveResult.success || !saveResult.data) return
        setBackingUp(true)
        setBackupMsg("")
        const result = await window.api.exportBackup(saveResult.data)
        if (result.success) {
            setBackupMsg(t("backup.exportedDesc"))
        } else {
            setBackupMsg(result.error ?? t("common.error"))
        }
        setBackingUp(false)
    }

    return (
        <div className="mx-auto max-w-2xl p-8">
            <h2 className="text-2xl font-semibold">{t("settings.title")}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{t("setup.subtitle")}</p>

            <div className="mt-6 flex border-b">
                <TabBtn active={activeTab === "profile"} onClick={() => setActiveTab("profile")}>
                    {t("settings.profile")}
                </TabBtn>
                <TabBtn active={activeTab === "preferences"} onClick={() => setActiveTab("preferences")}>
                    {t("settings.preferences")}
                </TabBtn>
                <TabBtn active={activeTab === "security"} onClick={() => setActiveTab("security")}>
                    {t("settings.security")}
                </TabBtn>
            </div>

            {activeTab !== "security" ? (
                <form onSubmit={form.handleSubmit(handleSubmit)} className="mt-8 space-y-8">
                    {activeTab === "profile" ? (
                        <>
                            <Field label={`${t("setup.name")} *`} error={form.formState.errors.name?.message}>
                                <input
                                    {...form.register("name")}
                                    className={inputCn}
                                    placeholder="Armya Bakouan"
                                />
                            </Field>
                            <Field label={`${t("setup.address")} *`} error={form.formState.errors.address?.message}>
                                <textarea {...form.register("address")} rows={2} className={textareaCn} />
                            </Field>
                            <div className="grid grid-cols-2 gap-4">
                                <Field label={t("setup.city")}>
                                    <input {...form.register("city")} className={inputCn} placeholder="Chicoutimi" />
                                </Field>
                                <Field label={t("setup.province")}>
                                    <input {...form.register("province")} className={inputCn} placeholder="QC" />
                                </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <Field label={t("setup.postalCode")}>
                                    <input {...form.register("postalCode")} className={inputCn} placeholder="G7J 1G6" />
                                </Field>
                                <Field label={t("setup.country")}>
                                    <input {...form.register("country")} className={inputCn} placeholder="Canada" />
                                </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <Field label={t("setup.phone")}>
                                    <input {...form.register("phone")} className={inputCn} />
                                </Field>
                                <Field label={t("setup.email")} error={form.formState.errors.email?.message}>
                                    <input {...form.register("email")} type="email" className={inputCn} />
                                </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <Field label={t("settings.gstNumber")}>
                                    <input {...form.register("gstNumber")} className={inputCn} placeholder="123456789 RT 0001" />
                                </Field>
                                <Field label={t("settings.qstNumber")}>
                                    <input {...form.register("qstNumber")} className={inputCn} placeholder="1234567890 TQ 0001" />
                                </Field>
                            </div>
                            <Field label={t("settings.logo")}>
                                <div className="flex items-center gap-3">
                                    {logoPath ? (
                                        <img
                                            src={`file://${logoPath}`}
                                            alt="Logo"
                                            className="h-12 w-auto rounded border object-contain p-1"
                                        />
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={handleUploadLogo}
                                        className={`${outlineBtnCn} flex items-center gap-2`}
                                    >
                                        <ImagePlus className="h-4 w-4" />
                                        {t("settings.uploadLogo")}
                                    </button>
                                    {logoPath ? (
                                        <button
                                            type="button"
                                            onClick={() => setLogoPath(null)}
                                            className="text-muted-foreground hover:text-destructive text-sm"
                                        >
                                            {t("common.delete")}
                                        </button>
                                    ) : null}
                                </div>
                            </Field>
                        </>
                    ) : (
                        <>
                            <div className="space-y-4">
                                <h3 className="border-b pb-2 text-base font-semibold">{t("settings.language")}</h3>
                                <Field label={t("setup.locale")}>
                                    <select {...form.register("locale")} className={selectCn}>
                                        <option value="fr-CA">{t("setup.localeFr")}</option>
                                        <option value="en-CA">{t("setup.localeEn")}</option>
                                    </select>
                                </Field>
                                <Field label={t("setup.hourlyRate")}>
                                    <input
                                        {...form.register("defaultHourlyRate")}
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        className={inputCn}
                                    />
                                </Field>
                            </div>

                            <div className="space-y-4">
                                <h3 className="border-b pb-2 text-base font-semibold">{t("settings.invoiceFormat")}</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <Field label={t("settings.invoiceFormat")} error={form.formState.errors.invoiceNumberFormat?.message}>
                                        <input
                                            {...form.register("invoiceNumberFormat")}
                                            className={inputCn}
                                            placeholder="YYYY-NNN"
                                        />
                                        <p className="text-muted-foreground mt-1 text-xs">
                                            {t("settings.invoiceFormatHint")}
                                        </p>
                                    </Field>
                                    <Field label={t("settings.invoiceStartNumber")}>
                                        <input
                                            {...form.register("invoiceStartNumber")}
                                            type="number"
                                            min="1"
                                            className={inputCn}
                                        />
                                    </Field>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="border-b pb-2 text-base font-semibold">{t("settings.backup")}</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <Field label={t("settings.backupInterval")}>
                                        <input
                                            {...form.register("backupIntervalDays")}
                                            type="number"
                                            min="1"
                                            className={inputCn}
                                        />
                                    </Field>
                                    <Field label={t("settings.backupRetention")}>
                                        <input
                                            {...form.register("backupRetentionCount")}
                                            type="number"
                                            min="1"
                                            className={inputCn}
                                        />
                                    </Field>
                                </div>
                                <Field label={t("settings.lateAlert")}>
                                    <input
                                        {...form.register("lateInvoiceAlertDays")}
                                        type="number"
                                        min="1"
                                        className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-40 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                                    />
                                </Field>
                                <Field label={t("settings.taxReserveRate")}>
                                    <div className="flex items-center gap-2">
                                        <input
                                            {...form.register("taxReserveRate")}
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="1"
                                            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-24 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                                        />
                                        <span className="text-muted-foreground text-sm">%</span>
                                    </div>
                                </Field>
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleCreateBackup}
                                        disabled={backingUp || restoring}
                                        className={`${outlineBtnCn} flex items-center gap-2`}
                                    >
                                        {backingUp ? t("common.loading") : t("settings.createBackup")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleExportBackup}
                                        disabled={backingUp || restoring}
                                        className={`${outlineBtnCn} flex items-center gap-2`}
                                    >
                                        {t("settings.exportBackup")}
                                    </button>
                                    {!restoreConfirm ? (
                                        <button
                                            type="button"
                                            onClick={() => setRestoreConfirm(true)}
                                            disabled={backingUp || restoring}
                                            className="border-input bg-background hover:bg-destructive/10 hover:text-destructive inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium disabled:opacity-50"
                                        >
                                            {t("settings.restoreBackup")}
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="text-destructive text-sm">{t("backup.restoreConfirm")}</span>
                                            <button
                                                type="button"
                                                onClick={handleRestoreBackup}
                                                disabled={restoring}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium disabled:opacity-50"
                                            >
                                                {restoring ? t("common.loading") : t("common.confirm")}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRestoreConfirm(false)}
                                                className="text-muted-foreground hover:text-foreground text-sm"
                                            >
                                                {t("common.cancel")}
                                            </button>
                                        </div>
                                    )}
                                    {backupMsg ? (
                                        <span className="text-muted-foreground text-sm">{backupMsg}</span>
                                    ) : null}
                                </div>
                            </div>
                        </>
                    )}

                    {error ? <p className="text-destructive text-sm">{error}</p> : null}

                    <div className="flex items-center gap-3 border-t pt-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-6 text-sm font-medium disabled:opacity-50"
                        >
                            {saving ? t("common.loading") : t("common.save")}
                        </button>
                        {saved ? (
                            <span className="text-sm text-green-600">{t("toast.savedSuccess")}</span>
                        ) : null}
                    </div>
                </form>
            ) : (
                <div className="mt-8">
                    <PinSection hasPinEnabled={!!profile?.appPin} touchIdEnabled={!!profile?.touchIdEnabled} onUpdate={(p) => setProfile(p)} />
                </div>
            )}
        </div>
    )
}

interface TabBtnProps {
    active: boolean
    onClick: () => void
    children: React.ReactNode
}

const TabBtn: React.FC<TabBtnProps> = ({ active, onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
        )}
    >
        {children}
    </button>
)

interface PinSectionProps {
    hasPinEnabled: boolean
    touchIdEnabled: boolean
    onUpdate: (newProfile: Profile) => void
}

const PinSection: React.FC<PinSectionProps> = ({ hasPinEnabled, touchIdEnabled, onUpdate }) => {
    const { t } = useTranslation()
    const [mode, setMode] = useState<"idle" | "set" | "change" | "disable">("idle")
    const [currentPin, setCurrentPin] = useState("")
    const [newPin, setNewPin] = useState("")
    const [confirmPin, setConfirmPin] = useState("")
    const [pinError, setPinError] = useState("")
    const [loading, setLoading] = useState(false)
    const [touchIdAvailable, setTouchIdAvailable] = useState(false)

    useEffect(() => {
        window.api.touchIdAvailable().then((res) => {
            setTouchIdAvailable(res.success && (res.data as boolean))
        }).catch(() => { /* no-op */ })
    }, [])

    function reset(): void {
        setMode("idle")
        setCurrentPin("")
        setNewPin("")
        setConfirmPin("")
        setPinError("")
    }

    async function handleToggleTouchId(): Promise<void> {
        setLoading(true)
        const result = await window.api.setTouchId(!touchIdEnabled)
        if (result.success && result.data) onUpdate(result.data as Profile)
        setLoading(false)
    }

    async function handleSetPin(): Promise<void> {
        if (newPin.length < 4) { setPinError(t("security.pinTooShort")); return }
        if (newPin !== confirmPin) { setPinError(t("security.pinMismatch")); return }
        setLoading(true)
        const result = await window.api.setPin(newPin)
        if (result.success && result.data) {
            onUpdate(result.data as Profile)
            reset()
        } else {
            setPinError(result.error ?? t("common.error"))
        }
        setLoading(false)
    }

    async function handleChangePin(): Promise<void> {
        if (newPin.length < 4) { setPinError(t("security.pinTooShort")); return }
        if (newPin !== confirmPin) { setPinError(t("security.pinMismatch")); return }
        setLoading(true)
        const verifyResult = await window.api.verifyPin(currentPin)
        if (!verifyResult.success || !(verifyResult.data as { valid: boolean }).valid) {
            setPinError(t("security.wrongPin"))
            setLoading(false)
            return
        }
        const result = await window.api.setPin(newPin)
        if (result.success && result.data) {
            onUpdate(result.data as Profile)
            reset()
        } else {
            setPinError(result.error ?? t("common.error"))
        }
        setLoading(false)
    }

    async function handleDisablePin(): Promise<void> {
        setLoading(true)
        const verifyResult = await window.api.verifyPin(currentPin)
        if (!verifyResult.success || !(verifyResult.data as { valid: boolean }).valid) {
            setPinError(t("security.wrongPin"))
            setLoading(false)
            return
        }
        const result = await window.api.removePin()
        if (result.success && result.data) {
            onUpdate(result.data as Profile)
            reset()
        } else {
            setPinError(result.error ?? t("common.error"))
        }
        setLoading(false)
    }

    if (mode === "idle") {
        return (
            <div className="space-y-6">
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        {hasPinEnabled
                            ? <Lock className="h-4 w-4 text-green-600" />
                            : <LockOpen className="h-4 w-4 text-muted-foreground" />
                        }
                        <span className={cn("text-sm", hasPinEnabled ? "font-medium text-green-600" : "text-muted-foreground")}>
                            {hasPinEnabled ? t("security.enabled") : t("security.disabled")}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        {!hasPinEnabled ? (
                            <button type="button" onClick={() => setMode("set")} className={`${outlineBtnCn} flex items-center gap-2`}>
                                <Shield className="h-4 w-4" />
                                {t("security.enable")}
                            </button>
                        ) : (
                            <>
                                <button type="button" onClick={() => setMode("change")} className={outlineBtnCn}>
                                    {t("security.change")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode("disable")}
                                    className="border-input bg-background hover:bg-destructive/10 hover:text-destructive inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium disabled:opacity-50"
                                >
                                    {t("security.disable")}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {touchIdAvailable && hasPinEnabled ? (
                    <div className="border-t pt-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Fingerprint className={cn("h-4 w-4", touchIdEnabled ? "text-green-600" : "text-muted-foreground")} />
                                <span className="text-sm font-medium">{t("security.touchIdLabel")}</span>
                            </div>
                            <button
                                type="button"
                                onClick={handleToggleTouchId}
                                disabled={loading}
                                className={cn(
                                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50",
                                    touchIdEnabled ? "bg-primary" : "bg-input"
                                )}
                                role="switch"
                                aria-checked={touchIdEnabled}
                            >
                                <span
                                    className={cn(
                                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200",
                                        touchIdEnabled ? "translate-x-5" : "translate-x-0"
                                    )}
                                />
                            </button>
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs">{t("security.touchIdHint")}</p>
                    </div>
                ) : null}
            </div>
        )
    }

    if (mode === "set") {
        return (
            <div className="space-y-3">
                <Field label={t("security.newPin")}>
                    <input
                        type="password"
                        inputMode="numeric"
                        value={newPin}
                        onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, "")); setPinError("") }}
                        className={inputCn}
                        placeholder={t("security.pinPlaceholder")}
                        autoComplete="new-password"
                    />
                </Field>
                <Field label={t("security.confirmPin")}>
                    <input
                        type="password"
                        inputMode="numeric"
                        value={confirmPin}
                        onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, "")); setPinError("") }}
                        className={inputCn}
                        placeholder={t("security.pinPlaceholder")}
                        autoComplete="new-password"
                    />
                </Field>
                {pinError ? <p className="text-destructive text-sm">{pinError}</p> : null}
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleSetPin}
                        disabled={loading}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
                    >
                        {loading ? t("common.loading") : t("security.enable")}
                    </button>
                    <button type="button" onClick={reset} className={outlineBtnCn}>{t("common.cancel")}</button>
                </div>
            </div>
        )
    }

    if (mode === "change") {
        return (
            <div className="space-y-3">
                <Field label={t("security.currentPin")}>
                    <input
                        type="password"
                        inputMode="numeric"
                        value={currentPin}
                        onChange={(e) => { setCurrentPin(e.target.value.replace(/\D/g, "")); setPinError("") }}
                        className={inputCn}
                        placeholder={t("security.pinPlaceholder")}
                        autoComplete="current-password"
                    />
                </Field>
                <Field label={t("security.newPin")}>
                    <input
                        type="password"
                        inputMode="numeric"
                        value={newPin}
                        onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, "")); setPinError("") }}
                        className={inputCn}
                        placeholder={t("security.pinPlaceholder")}
                        autoComplete="new-password"
                    />
                </Field>
                <Field label={t("security.confirmPin")}>
                    <input
                        type="password"
                        inputMode="numeric"
                        value={confirmPin}
                        onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, "")); setPinError("") }}
                        className={inputCn}
                        placeholder={t("security.pinPlaceholder")}
                        autoComplete="new-password"
                    />
                </Field>
                {pinError ? <p className="text-destructive text-sm">{pinError}</p> : null}
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleChangePin}
                        disabled={loading}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
                    >
                        {loading ? t("common.loading") : t("security.change")}
                    </button>
                    <button type="button" onClick={reset} className={outlineBtnCn}>{t("common.cancel")}</button>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <p className="text-muted-foreground text-sm">{t("security.disableConfirm")}</p>
            <Field label={t("security.currentPin")}>
                <input
                    type="password"
                    inputMode="numeric"
                    value={currentPin}
                    onChange={(e) => { setCurrentPin(e.target.value.replace(/\D/g, "")); setPinError("") }}
                    className={inputCn}
                    placeholder={t("security.pinPlaceholder")}
                    autoComplete="current-password"
                />
            </Field>
            {pinError ? <p className="text-destructive text-sm">{pinError}</p> : null}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={handleDisablePin}
                    disabled={loading}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
                >
                    {loading ? t("common.loading") : t("security.disable")}
                </button>
                <button type="button" onClick={reset} className={outlineBtnCn}>{t("common.cancel")}</button>
            </div>
        </div>
    )
}

interface FieldProps {
    label: string
    error?: string
    children: React.ReactNode
}

const Field: React.FC<FieldProps> = ({ label, error, children }) => (
    <div className="space-y-1">
        <label className="text-sm font-medium">{label}</label>
        {children}
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
)

const inputCn =
    "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"

const textareaCn =
    "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"

const selectCn =
    "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"

const outlineBtnCn =
    "border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium disabled:opacity-50"
