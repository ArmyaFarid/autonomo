import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useAtom } from "jotai"
import { ImagePlus, FolderOpen } from "lucide-react"
import { profileAtom } from "../../store/profileAtom"
import type { Profile } from "../../types/definitions"

const profileSchema = z.object({
    name: z.string().min(1),
    address: z.string().min(1),
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
})

type ProfileFormValues = z.infer<typeof profileSchema>

export function SettingsPage(): JSX.Element {
    const { t, i18n } = useTranslation()
    const [profile, setProfile] = useAtom(profileAtom)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState("")
    const [logoPath, setLogoPath] = useState<string | null>(null)
    const [backingUp, setBackingUp] = useState(false)
    const [backupMsg, setBackupMsg] = useState("")

    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            name: "",
            address: "",
            phone: "",
            email: "",
            gstNumber: "",
            qstNumber: "",
            defaultHourlyRate: 23,
            invoiceStartNumber: 1,
            invoiceNumberFormat: "YYYY-NNN",
            locale: "fr-CA",
            backupIntervalDays: 7,
            backupRetentionCount: 10,
            lateInvoiceAlertDays: 30,
        },
    })

    useEffect(() => {
        if (profile) {
            form.reset({
                name: profile.name,
                address: profile.address,
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
            })
            setLogoPath(profile.logoPath)
        }
    }, [profile])

    async function handleSubmit(values: ProfileFormValues): Promise<void> {
        setSaving(true)
        setSaved(false)
        setError("")

        const result = await window.api.saveProfile({ ...values, logoPath })
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

    return (
        <div className="mx-auto max-w-2xl p-8">
            <h2 className="text-2xl font-semibold">{t("settings.title")}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{t("setup.subtitle")}</p>

            <form onSubmit={form.handleSubmit(handleSubmit)} className="mt-8 space-y-8">
                <Section title={t("settings.profile")}>
                    <Field label={`${t("setup.name")} *`} error={form.formState.errors.name?.message}>
                        <input
                            {...form.register("name")}
                            className={inputCn}
                            placeholder="Armya Bakouan"
                        />
                    </Field>
                    <Field label={`${t("setup.address")} *`} error={form.formState.errors.address?.message}>
                        <textarea {...form.register("address")} rows={3} className={textareaCn} />
                    </Field>
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
                </Section>

                <Section title={t("settings.language")}>
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
                </Section>

                <Section title={t("settings.invoiceFormat")}>
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
                </Section>

                <Section title={t("settings.backup")}>
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
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleCreateBackup}
                            disabled={backingUp}
                            className={`${outlineBtnCn} flex items-center gap-2`}
                        >
                            {backingUp ? t("common.loading") : t("settings.createBackup")}
                        </button>
                        {backupMsg ? (
                            <span className="text-muted-foreground text-sm">{backupMsg}</span>
                        ) : null}
                    </div>
                </Section>

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
        </div>
    )
}

interface SectionProps {
    title: string
    children: React.ReactNode
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
    <div className="space-y-4">
        <h3 className="text-base font-semibold border-b pb-2">{title}</h3>
        {children}
    </div>
)

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
