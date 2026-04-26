import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronLeft, Plus, Trash2 } from "lucide-react"
import { useAtomValue } from "jotai"
import { clientsAtom } from "../../../store/clientsAtom"
import { profileAtom } from "../../../store/profileAtom"
import { toIsoDate, formatDate, formatCurrency } from "../../../lib/utils"

const GST_RATE = 0.05
const QST_RATE = 0.09975

interface InvoiceInlineEditorProps {
    onBack: () => void
}

interface FreeRow { label: string; description: string; qty: number; unitPrice: number }

// ── Editable field: looks like invoice text, becomes an input on click ──
interface EditableTextProps {
    value: string
    onChange: (v: string) => void
    className?: string
    placeholder?: string
    multiline?: boolean
}

const EditableText: React.FC<EditableTextProps> = ({ value, onChange, className = "", placeholder = "…", multiline }) => {
    const [editing, setEditing] = useState(false)
    const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

    useEffect(() => { if (editing) ref.current?.focus() }, [editing])

    const display = value || <span className="text-gray-300">{placeholder}</span>
    const sharedCn = `${className} rounded outline-none transition-colors`

    if (editing) {
        if (multiline) {
            return (
                <textarea
                    ref={ref as React.RefObject<HTMLTextAreaElement>}
                    value={value}
                    rows={3}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={() => setEditing(false)}
                    className={`${sharedCn} ring-2 ring-blue-300 bg-blue-50/60 w-full resize-none px-1`}
                />
            )
        }
        return (
            <input
                ref={ref as React.RefObject<HTMLInputElement>}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => setEditing(false)}
                className={`${sharedCn} ring-2 ring-blue-300 bg-blue-50/60 w-full px-1`}
            />
        )
    }

    return (
        <span
            onClick={() => setEditing(true)}
            title="Cliquer pour modifier"
            className={`${sharedCn} cursor-text hover:bg-blue-50/70 hover:ring-1 hover:ring-blue-200 inline-block min-w-[2rem] px-1`}
        >
            {display}
        </span>
    )
}

interface EditableNumberProps {
    value: number
    onChange: (v: number) => void
    className?: string
    step?: number
    min?: number
}

const EditableNumber: React.FC<EditableNumberProps> = ({ value, onChange, className = "", step = 1, min = 0 }) => {
    const [editing, setEditing] = useState(false)
    const ref = useRef<HTMLInputElement>(null)

    useEffect(() => { if (editing) ref.current?.select() }, [editing])

    if (editing) {
        return (
            <input
                ref={ref}
                type="number"
                value={value}
                step={step}
                min={min}
                onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                onBlur={() => setEditing(false)}
                className={`${className} w-20 rounded bg-blue-50/60 px-1 text-right outline-none ring-2 ring-blue-300`}
            />
        )
    }

    return (
        <span
            onClick={() => setEditing(true)}
            title="Cliquer pour modifier"
            className={`${className} cursor-text rounded px-1 hover:bg-blue-50/70 hover:ring-1 hover:ring-blue-200`}
        >
            {value}
        </span>
    )
}

interface EditableDateProps {
    value: string
    onChange: (v: string) => void
    className?: string
    locale: string
}

const EditableDate: React.FC<EditableDateProps> = ({ value, onChange, className = "", locale }) => {
    const [editing, setEditing] = useState(false)
    const ref = useRef<HTMLInputElement>(null)

    useEffect(() => { if (editing) ref.current?.focus() }, [editing])

    if (editing) {
        return (
            <input
                ref={ref}
                type="date"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => setEditing(false)}
                className={`${className} rounded bg-blue-50/60 px-1 outline-none ring-2 ring-blue-300`}
            />
        )
    }

    return (
        <span
            onClick={() => setEditing(true)}
            title="Cliquer pour modifier"
            className={`${className} cursor-text rounded px-1 hover:bg-blue-50/70 hover:ring-1 hover:ring-blue-200`}
        >
            {value ? formatDate(value, locale) : <span className="text-gray-300">—</span>}
        </span>
    )
}

export function InvoiceInlineEditor({ onBack }: InvoiceInlineEditorProps): JSX.Element {
    const { t } = useTranslation()
    const clients = useAtomValue(clientsAtom)
    const profile = useAtomValue(profileAtom)
    const locale = profile?.locale ?? "fr-CA"
    const activeClients = clients.filter((c) => c.active === 1)

    const today = toIsoDate(new Date())
    const due = new Date(); due.setDate(due.getDate() + 30)

    const [clientId, setClientId] = useState(0)
    const [number, setNumber] = useState("—")
    const [issueDate, setIssueDate] = useState(today)
    const [dueDate, setDueDate] = useState(toIsoDate(due))
    const [periodStart, setPeriodStart] = useState(today)
    const [periodEnd, setPeriodEnd] = useState(today)
    const [description, setDescription] = useState("")
    const [enableGst, setEnableGst] = useState(false)
    const [enableQst, setEnableQst] = useState(false)
    const [rows, setRows] = useState<FreeRow[]>([{ label: "", description: "", qty: 1, unitPrice: profile?.defaultHourlyRate ?? 23 }])

    useEffect(() => {
        window.api.getNextInvoiceNumber().then((r) => { if (r.success) setNumber(r.data as string) })
    }, [])

    const selectedClient = activeClients.find((c) => c.id === clientId) ?? null

    const subtotal = rows.reduce((s, r) => s + r.qty * r.unitPrice, 0)
    const gstAmount = enableGst ? subtotal * GST_RATE : 0
    const qstAmount = enableQst ? subtotal * QST_RATE : 0
    const total = subtotal + gstAmount + qstAmount
    const taxTotal = gstAmount + qstAmount

    function updateRow(i: number, field: keyof FreeRow, value: string | number): void {
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
    }

    const fmtC = (n: number) => formatCurrency(n, locale)

    // Issuer block
    const issuerLines: string[] = profile ? [profile.name] : []
    if (profile?.address) for (const l of profile.address.split("\n")) if (l.trim()) issuerLines.push(l.trim())
    const cityLine = [profile?.city, profile?.province, profile?.postalCode].filter(Boolean).join(" ")
    if (cityLine) issuerLines.push(cityLine)
    if (profile?.country) issuerLines.push(profile.country)
    if (profile?.phone) issuerLines.push(profile.phone ?? "")
    if (profile?.email) issuerLines.push(profile.email ?? "")

    return (
        <div className="flex h-screen flex-col bg-muted/20">
            {/* Header */}
            <div className="border-b bg-background flex items-center gap-3 px-4 py-2">
                <button type="button" onClick={onBack} className="hover:bg-accent flex items-center gap-1 rounded px-2 py-1 text-sm">
                    <ChevronLeft className="h-4 w-4" />
                    {t("common.back")}
                </button>
                <span className="text-sm font-semibold">Option B — Édition inline</span>
                <span className="text-muted-foreground text-xs">Cliquez sur n'importe quel champ pour le modifier directement.</span>
                {/* Client picker — stays outside the invoice document */}
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Client :</span>
                    <select value={clientId} onChange={(e) => setClientId(Number(e.target.value))} className="border-input bg-background h-7 rounded border px-2 text-sm">
                        <option value={0}>{t("invoices.selectClient")}</option>
                        {activeClients.map((c) => <option key={c.id} value={c.id}>{c.companyName ?? c.name}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={enableGst} onChange={(e) => setEnableGst(e.target.checked)} /> TPS</label>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={enableQst} onChange={(e) => setEnableQst(e.target.checked)} /> TVQ</label>
                </div>
            </div>

            {/* Invoice document */}
            <div className="flex-1 overflow-y-auto py-8">
                <div className="mx-auto max-w-3xl rounded-lg border bg-white shadow-md" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: "11pt", color: "#1a1a1a", padding: "48px 56px" }}>

                    {/* Top: logo + issuer */}
                    <div className="mb-10 flex justify-between items-start">
                        <div>
                            {profile?.logoPath ? <img src={`file://${profile.logoPath}`} alt="Logo" className="max-h-14 max-w-[140px] object-contain" /> : <span className="text-xs text-gray-300">Logo</span>}
                        </div>
                        <div className="text-right leading-7 text-[10.5pt]">
                            {issuerLines.map((l, i) => <div key={i}>{l}</div>)}
                        </div>
                    </div>

                    {/* Meta bar */}
                    <div className="mb-1 grid gap-4" style={{ gridTemplateColumns: "2fr 1fr 1fr 1.6fr" }}>
                        <div>
                            <div className="mb-1 text-[9.5pt]" style={{ color: "#5a8fa5" }}>Facturé à</div>
                            <div className="font-semibold">{selectedClient?.companyName ?? selectedClient?.name ?? <span className="text-gray-300">—</span>}</div>
                            <div className="mt-1 text-[9.5pt]" style={{ color: "#555" }}>
                                {(selectedClient?.address ?? "").split("\n").map((l, i) => <div key={i}>{l}</div>)}
                            </div>
                        </div>
                        <div>
                            <div className="mb-1 text-[9.5pt]" style={{ color: "#5a8fa5" }}>Date d'émission</div>
                            <EditableDate value={issueDate} onChange={setIssueDate} locale={locale} className="font-semibold" />
                            {dueDate ? (
                                <>
                                    <div className="mt-1.5 text-[9.5pt]" style={{ color: "#5a8fa5" }}>Date d'échéance</div>
                                    <EditableDate value={dueDate} onChange={setDueDate} locale={locale} className="font-semibold text-[10pt]" style={{ color: "#c0392b" } as React.CSSProperties} />
                                </>
                            ) : null}
                        </div>
                        <div>
                            <div className="mb-1 text-[9.5pt]" style={{ color: "#5a8fa5" }}>Numéro de facture</div>
                            <EditableText value={number} onChange={setNumber} className="font-semibold" />
                        </div>
                        <div className="text-right">
                            <div className="mb-1 text-right text-[9.5pt]" style={{ color: "#5a8fa5" }}>Montant dû (CAD)</div>
                            <div className="font-bold leading-none" style={{ fontSize: "28pt" }}>{fmtC(total)}</div>
                        </div>
                    </div>

                    <hr style={{ border: "none", borderTop: "1.5px solid #c8d8e2", margin: "20px 0 24px" }} />

                    {/* Description block */}
                    <div style={{ marginBottom: 24, padding: "12px 16px", background: "#f0f6f9", borderLeft: "3px solid #5a8fa5", borderRadius: 3 }}>
                        <div className="mb-1 text-[9.5pt] font-semibold" style={{ color: "#5a8fa5" }}>
                            Période :&nbsp;
                            <EditableDate value={periodStart} onChange={setPeriodStart} locale={locale} />
                            &nbsp;→&nbsp;
                            <EditableDate value={periodEnd} onChange={setPeriodEnd} locale={locale} />
                        </div>
                        <EditableText
                            value={description}
                            onChange={setDescription}
                            placeholder="Services rendus…"
                            multiline
                            className="text-[10.5pt] leading-relaxed"
                        />
                    </div>

                    {/* Line items table */}
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                <th style={{ fontSize: "9.5pt", fontWeight: 500, color: "#5a8fa5", paddingBottom: 10, textAlign: "left", borderBottom: "1.5px solid #c8d8e2" }}>Description</th>
                                <th style={{ fontSize: "9.5pt", fontWeight: 500, color: "#5a8fa5", paddingBottom: 10, textAlign: "right", borderBottom: "1.5px solid #c8d8e2" }}>Taux</th>
                                <th style={{ fontSize: "9.5pt", fontWeight: 500, color: "#5a8fa5", paddingBottom: 10, textAlign: "right", borderBottom: "1.5px solid #c8d8e2" }}>Qté</th>
                                <th style={{ fontSize: "9.5pt", fontWeight: 500, color: "#5a8fa5", paddingBottom: 10, textAlign: "right", borderBottom: "1.5px solid #c8d8e2" }}>Montant</th>
                                <th style={{ borderBottom: "1.5px solid #c8d8e2", width: 24 }} />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={i}>
                                    <td style={{ padding: "14px 0", borderBottom: "1px solid #e8ecef", verticalAlign: "top" }}>
                                        <div className="font-semibold"><EditableText value={row.label} onChange={(v) => updateRow(i, "label", v)} placeholder="Titre…" /></div>
                                        <div className="mt-0.5 text-[9.5pt]" style={{ color: "#777" }}><EditableText value={row.description} onChange={(v) => updateRow(i, "description", v)} placeholder="Détail (optionnel)" /></div>
                                    </td>
                                    <td style={{ padding: "14px 0", borderBottom: "1px solid #e8ecef", textAlign: "right", verticalAlign: "top" }}>
                                        <EditableNumber value={row.unitPrice} onChange={(v) => updateRow(i, "unitPrice", v)} step={0.5} className="text-right" />
                                    </td>
                                    <td style={{ padding: "14px 0", borderBottom: "1px solid #e8ecef", textAlign: "right", verticalAlign: "top" }}>
                                        <EditableNumber value={row.qty} onChange={(v) => updateRow(i, "qty", v)} step={0.5} className="text-right" />
                                    </td>
                                    <td style={{ padding: "14px 0", borderBottom: "1px solid #e8ecef", textAlign: "right", verticalAlign: "top", fontWeight: 500 }}>
                                        {fmtC(row.qty * row.unitPrice)}
                                    </td>
                                    <td style={{ padding: "14px 0", borderBottom: "1px solid #e8ecef", textAlign: "center", verticalAlign: "top" }}>
                                        {rows.length > 1 ? (
                                            <button type="button" onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <button
                        type="button"
                        onClick={() => setRows((p) => [...p, { label: "", description: "", qty: 1, unitPrice: profile?.defaultHourlyRate ?? 23 }])}
                        className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                        <Plus className="h-3 w-3" /> Ajouter une ligne
                    </button>

                    {/* Totals */}
                    <div className="mt-6 flex justify-end">
                        <table style={{ width: 300, borderCollapse: "collapse" }}>
                            <tbody>
                                <tr>
                                    <td style={{ padding: "5px 0", textAlign: "right", paddingRight: 28, color: "#444", fontSize: "10.5pt" }}>Sous-total</td>
                                    <td style={{ padding: "5px 0", textAlign: "right", minWidth: 90, fontSize: "10.5pt" }}>{fmtC(subtotal)}</td>
                                </tr>
                                {taxTotal > 0 ? (
                                    <tr>
                                        <td style={{ padding: "5px 0", textAlign: "right", paddingRight: 28, color: "#444", fontSize: "10.5pt" }}>Taxe</td>
                                        <td style={{ padding: "5px 0", textAlign: "right", minWidth: 90, fontSize: "10.5pt" }}>{fmtC(taxTotal)}</td>
                                    </tr>
                                ) : null}
                                <tr style={{ borderTop: "1px solid #c8d8e2" }}>
                                    <td style={{ paddingTop: 8, textAlign: "right", paddingRight: 28, color: "#444", fontSize: "10.5pt" }}>Total</td>
                                    <td style={{ paddingTop: 8, textAlign: "right", minWidth: 90, fontSize: "10.5pt" }}>{fmtC(total)}</td>
                                </tr>
                                <tr style={{ borderTop: "1px solid #c8d8e2" }}>
                                    <td style={{ paddingTop: 8, textAlign: "right", paddingRight: 28, color: "#5a8fa5", fontWeight: 600, fontSize: "11pt" }}>Montant dû (CAD)</td>
                                    <td style={{ paddingTop: 8, textAlign: "right", minWidth: 90, color: "#5a8fa5", fontWeight: 700, fontSize: "11pt" }}>{fmtC(total)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
