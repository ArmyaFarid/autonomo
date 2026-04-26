import type { Profile, Client } from "../../../types/definitions"

export interface PreviewLine {
    label: string
    description: string
    qty: number
    unitPrice: number
    amount: number
}

export interface PreviewData {
    profile: Profile | null
    client: Client | null
    number: string
    issueDate: string
    dueDate: string | null
    periodStart: string
    periodEnd: string
    invoiceType: "weekly" | "freeform"
    description: string
    lines: PreviewLine[]
    subtotal: number
    gstAmount: number
    qstAmount: number
    total: number
    locale: string
}

function fmtDate(dateStr: string, locale: string): string {
    if (!dateStr) return "—"
    const [y, m, d] = dateStr.split("-").map(Number)
    const date = new Date(y, m - 1, d)
    return locale === "fr-CA" ? date.toLocaleDateString("fr-CA") : date.toLocaleDateString("en-CA")
}

function fmtCurrency(amount: number, locale: string): string {
    if (locale === "fr-CA") return `${amount.toFixed(2).replace(".", ",")} $`
    return `$${amount.toFixed(2)}`
}

const TEMPLATE_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; background: #fff; }
.page { padding: 48px 56px; max-width: 860px; margin: 0 auto; }
.top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
.logo img { max-height: 56px; max-width: 140px; object-fit: contain; }
.issuer { text-align: right; line-height: 1.75; font-size: 10.5pt; }
.meta { display: grid; grid-template-columns: 2fr 1fr 1fr 1.6fr; gap: 16px; align-items: end; margin-bottom: 6px; }
.meta-label { font-size: 9.5pt; color: #5a8fa5; margin-bottom: 5px; }
.meta-value { font-weight: 600; font-size: 11pt; }
.meta-client-addr { font-size: 9.5pt; color: #555; margin-top: 4px; line-height: 1.5; }
.meta-amount-block { text-align: right; }
.meta-total-label { font-size: 9.5pt; color: #5a8fa5; margin-bottom: 5px; text-align: right; }
.meta-total-value { font-size: 28pt; font-weight: 700; line-height: 1; }
.divider { border: none; border-top: 1.5px solid #c8d8e2; margin: 20px 0 28px; }
table { width: 100%; border-collapse: collapse; }
thead th { font-size: 9.5pt; font-weight: 500; color: #5a8fa5; padding: 0 0 10px 0; text-align: right; border-bottom: 1.5px solid #c8d8e2; }
thead th.col-desc { text-align: left; }
tbody tr td { padding: 14px 0; border-bottom: 1px solid #e8ecef; vertical-align: top; }
.desc-title { font-weight: 600; font-size: 11pt; }
.desc-date { font-size: 9.5pt; color: #777; margin-top: 3px; }
td.right { text-align: right; }
td.col-rate { min-width: 80px; }
td.col-qty { min-width: 50px; }
td.col-amt { min-width: 90px; font-weight: 500; }
.totals-wrap { display: flex; justify-content: flex-end; margin-top: 24px; }
.totals-table { width: 300px; border-collapse: collapse; }
.totals-table td { padding: 5px 0; font-size: 10.5pt; }
.t-label { text-align: right; padding-right: 28px; color: #444; }
.t-value { text-align: right; min-width: 90px; }
.t-sep td { border-top: 1px solid #c8d8e2; padding-top: 8px; }
.t-due .t-label { color: #5a8fa5; font-weight: 600; font-size: 11pt; }
.t-due .t-value { color: #5a8fa5; font-weight: 700; font-size: 11pt; }
.desc-block { margin-bottom: 24px; padding: 12px 16px; background: #f0f6f9; border-left: 3px solid #5a8fa5; border-radius: 3px; }
.desc-block-period { font-size: 9.5pt; font-weight: 600; color: #5a8fa5; margin-bottom: 5px; }
.desc-block-services { font-size: 10.5pt; color: #1a1a1a; line-height: 1.55; }
`

export function buildPreviewHtml(data: PreviewData): string {
    const { profile, client, locale } = data

    const logoBlock = profile?.logoPath ? `<img src="file://${profile.logoPath}" alt="Logo" />` : ""

    const issuerLines: string[] = profile ? [profile.name] : ["—"]
    if (profile?.address) for (const line of profile.address.split("\n")) if (line.trim()) issuerLines.push(line.trim())
    const cityLine = [profile?.city, profile?.province, profile?.postalCode].filter(Boolean).join(" ")
    if (cityLine) issuerLines.push(cityLine)
    if (profile?.country) issuerLines.push(profile.country)
    if (profile?.phone) issuerLines.push(profile.phone ?? "")
    if (profile?.email) issuerLines.push(profile.email ?? "")
    if (profile?.gstNumber) issuerLines.push(`TPS : ${profile.gstNumber}`)
    if (profile?.qstNumber) issuerLines.push(`TVQ : ${profile.qstNumber}`)
    const issuerBlock = issuerLines.filter(Boolean).join("<br>")

    const dueDateLabel = locale === "fr-CA" ? "Date d'échéance" : "Due date"
    const dueDateBlock = data.dueDate
        ? `<div class="meta-label" style="margin-top:6px">${dueDateLabel}</div><div class="meta-value" style="font-size:10pt;color:#c0392b">${fmtDate(data.dueDate, locale)}</div>`
        : ""

    const periodLabel = locale === "fr-CA" ? "Période" : "Period"
    const hoursLabel = locale === "fr-CA" ? "Heures travaillées" : "Hours worked"
    const totalHours = data.lines.reduce((s, l) => s + l.qty, 0)
    let period = `${fmtDate(data.periodStart, locale)} → ${fmtDate(data.periodEnd, locale)}`
    if (data.invoiceType === "freeform") period += ` &nbsp;·&nbsp; ${hoursLabel} : ${totalHours} h`
    const servicesHtml = data.description
        ? `<div class="desc-block-services">${data.description.replace(/\n/g, " · ")}</div>`
        : ""
    const descriptionBlock = `
        <div class="desc-block">
            <div class="desc-block-period">${periodLabel} : ${period}</div>
            ${servicesHtml}
        </div>`

    const lineItems = data.lines.map((line) => `
        <tr>
            <td>
                <div class="desc-title">${line.label || "&nbsp;"}</div>
                ${line.description ? `<div class="desc-date">${line.description}</div>` : ""}
            </td>
            <td class="right col-rate">${fmtCurrency(line.unitPrice, locale)}</td>
            <td class="right col-qty">${line.qty}</td>
            <td class="right col-amt">${fmtCurrency(line.amount, locale)}</td>
        </tr>`).join("")

    const taxTotal = data.gstAmount + data.qstAmount
    const totalsRows = `
        <tr><td class="t-label">Sous-total</td><td class="t-value">${fmtCurrency(data.subtotal, locale)}</td></tr>
        ${taxTotal > 0 ? `<tr><td class="t-label">Taxe</td><td class="t-value">${fmtCurrency(taxTotal, locale)}</td></tr>` : ""}
        <tr class="t-sep"><td class="t-label">Total</td><td class="t-value">${fmtCurrency(data.total, locale)}</td></tr>
        <tr class="t-sep t-due"><td class="t-label">Montant dû (CAD)</td><td class="t-value">${fmtCurrency(data.total, locale)}</td></tr>`

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><style>${TEMPLATE_CSS}</style></head>
<body><div class="page">
    <div class="top">
        <div class="logo">${logoBlock}</div>
        <div class="issuer">${issuerBlock}</div>
    </div>
    <div class="meta">
        <div>
            <div class="meta-label">${locale === "fr-CA" ? "Facturé à" : "Billed to"}</div>
            <div class="meta-value">${client?.companyName ?? client?.name ?? "—"}</div>
            <div class="meta-client-addr">${(client?.address ?? "").replace(/\n/g, "<br>")}</div>
        </div>
        <div>
            <div class="meta-label">${locale === "fr-CA" ? "Date d'émission" : "Issue date"}</div>
            <div class="meta-value">${fmtDate(data.issueDate, locale)}</div>
            ${dueDateBlock}
        </div>
        <div>
            <div class="meta-label">${locale === "fr-CA" ? "Numéro de facture" : "Invoice number"}</div>
            <div class="meta-value">${data.number || "—"}</div>
        </div>
        <div class="meta-amount-block">
            <div class="meta-total-label">${locale === "fr-CA" ? "Montant dû (CAD)" : "Amount due (CAD)"}</div>
            <div class="meta-total-value">${fmtCurrency(data.total, locale)}</div>
        </div>
    </div>
    <hr class="divider"/>
    ${descriptionBlock}
    <table>
        <thead><tr>
            <th class="col-desc">Description</th>
            <th class="right col-rate">${locale === "fr-CA" ? "Taux" : "Rate"}</th>
            <th class="right col-qty">${locale === "fr-CA" ? "Qté" : "Qty"}</th>
            <th class="right col-amt">${locale === "fr-CA" ? "Montant" : "Amount"}</th>
        </tr></thead>
        <tbody>${lineItems || '<tr><td colspan="4" style="color:#aaa;padding:16px 0">—</td></tr>'}</tbody>
    </table>
    <div class="totals-wrap"><table class="totals-table">${totalsRows}</table></div>
</div></body></html>`
}
