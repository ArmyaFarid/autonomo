import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { X } from "lucide-react"
import type { Client } from "../../types/definitions"
import { AddressBlock } from "../../components/shared/address-block"
import type { AddressValue } from "../../components/shared/address-block"

const clientSchema = z.object({
    name: z.string().min(1),
    companyName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    primaryContact: z.string().optional(),
    billingType: z.enum(["hourly", "fixed"]),
    hourlyRate: z.coerce.number().min(0).optional(),
    defaultHoursPerPeriod: z.coerce.number().min(0).optional(),
    billingFrequency: z.enum(["biweekly", "monthly", "one-time"]),
    notes: z.string().optional(),
})

type ClientFormValues = z.infer<typeof clientSchema>

interface ClientFormModalProps {
    client: Client | null
    onSaved: () => void
    onClose: () => void
}

export const ClientFormModal: React.FC<ClientFormModalProps> = ({ client, onSaved, onClose }) => {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [addressError, setAddressError] = useState("")
    const isEdit = client !== null

    const [address, setAddress] = useState<AddressValue>({
        line1: "",
        line2: "",
        city: "",
        province: "QC",
        postalCode: "",
    })

    const form = useForm<ClientFormValues>({
        resolver: zodResolver(clientSchema),
        defaultValues: {
            name: "",
            companyName: "",
            phone: "",
            email: "",
            primaryContact: "",
            billingType: "hourly",
            hourlyRate: undefined,
            defaultHoursPerPeriod: undefined,
            billingFrequency: "biweekly",
            notes: "",
        },
    })

    const billingType = form.watch("billingType")

    useEffect(() => {
        if (client) {
            form.reset({
                name: client.name,
                companyName: client.companyName ?? "",
                phone: client.phone ?? "",
                email: client.email ?? "",
                primaryContact: client.primaryContact ?? "",
                billingType: client.billingType as "hourly" | "fixed",
                hourlyRate: client.hourlyRate ?? undefined,
                defaultHoursPerPeriod: client.defaultHoursPerPeriod ?? undefined,
                billingFrequency: client.billingFrequency as "biweekly" | "monthly" | "one-time",
                notes: client.notes ?? "",
            })
            setAddress({
                line1: client.address,
                line2: client.addressLine2 ?? "",
                city: client.city ?? "",
                province: client.province ?? "QC",
                postalCode: client.postalCode ?? "",
            })
        }
    }, [client])

    async function handleSubmit(values: ClientFormValues): Promise<void> {
        if (!address.line1.trim()) {
            setAddressError(t("setup.required"))
            return
        }
        setAddressError("")
        setLoading(true)
        setError("")

        const payload = {
            ...values,
            address: address.line1.trim(),
            addressLine2: address.line2.trim() || null,
            city: address.city.trim() || null,
            province: address.province || null,
            postalCode: address.postalCode.trim() || null,
            companyName: values.companyName || null,
            phone: values.phone || null,
            email: values.email || null,
            primaryContact: values.primaryContact || null,
            hourlyRate: values.hourlyRate ?? null,
            defaultHoursPerPeriod: values.defaultHoursPerPeriod ?? null,
            notes: values.notes || null,
        }

        const result = isEdit
            ? await window.api.updateClient(client!.id, payload)
            : await window.api.createClient(payload)

        if (result.success) {
            onSaved()
        } else {
            setError(result.error ?? t("common.error"))
        }
        setLoading(false)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background w-full max-w-2xl rounded-lg shadow-lg">
                <div className="flex items-center justify-between border-b px-6 py-4">
                    <h3 className="text-lg font-semibold">
                        {isEdit ? t("common.edit") : t("clients.new")}
                    </h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={form.handleSubmit(handleSubmit)} className="max-h-[75vh] overflow-y-auto px-6 py-4">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <Field label={`${t("clients.name")} *`} error={form.formState.errors.name?.message}>
                                <input {...form.register("name")} className={inputCn} />
                            </Field>
                            <Field label={t("clients.company")}>
                                <input {...form.register("companyName")} className={inputCn} />
                            </Field>
                        </div>

                        <AddressBlock
                            value={address}
                            onChange={setAddress}
                            line1Error={addressError}
                            required
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <Field label={t("clients.phone")}>
                                <input {...form.register("phone")} className={inputCn} />
                            </Field>
                            <Field label={t("clients.email")} error={form.formState.errors.email?.message}>
                                <input {...form.register("email")} type="email" className={inputCn} />
                            </Field>
                        </div>

                        <Field label={t("clients.primaryContact")}>
                            <input {...form.register("primaryContact")} className={inputCn} />
                        </Field>

                        <div className="grid grid-cols-3 gap-4">
                            <Field label={t("clients.billingType")}>
                                <select {...form.register("billingType")} className={selectCn}>
                                    <option value="hourly">{t("clients.billingTypeHourly")}</option>
                                    <option value="fixed">{t("clients.billingTypeFixed")}</option>
                                </select>
                            </Field>
                            <Field label={t("clients.frequency")}>
                                <select {...form.register("billingFrequency")} className={selectCn}>
                                    <option value="biweekly">{t("clients.frequencyBiweekly")}</option>
                                    <option value="monthly">{t("clients.frequencyMonthly")}</option>
                                    <option value="one-time">{t("clients.frequencyOneTime")}</option>
                                </select>
                            </Field>
                            {billingType === "hourly" ? (
                                <Field label={t("clients.hourlyRate")}>
                                    <input
                                        {...form.register("hourlyRate")}
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        className={inputCn}
                                    />
                                </Field>
                            ) : null}
                        </div>

                        {billingType === "hourly" ? (
                            <Field label={t("clients.defaultHours")}>
                                <input
                                    {...form.register("defaultHoursPerPeriod")}
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-40 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                                />
                                <p className="text-muted-foreground mt-1 text-xs">
                                    {t("clients.defaultHoursHint")}
                                </p>
                            </Field>
                        ) : null}

                        <Field label={t("clients.notes")}>
                            <textarea {...form.register("notes")} rows={3} className={textareaCn} />
                        </Field>
                    </div>

                    {error ? <p className="text-destructive mt-4 text-sm">{error}</p> : null}

                    <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                        <button type="button" onClick={onClose} className={outlineBtnCn}>
                            {t("common.cancel")}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-6 text-sm font-medium disabled:opacity-50"
                        >
                            {loading ? t("common.loading") : t("common.save")}
                        </button>
                    </div>
                </form>
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
    "border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
