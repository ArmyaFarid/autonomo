import { useState, useRef, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { cn, maskPostalCode } from "../../lib/utils"

export interface AddressValue {
    line1: string
    line2: string
    city: string
    province: string
    postalCode: string
}

interface NominatimAddress {
    house_number?: string
    road?: string
    city?: string
    town?: string
    village?: string
    suburb?: string
    county?: string
    state?: string
    postcode?: string
}

interface NominatimResult {
    display_name: string
    address: NominatimAddress
}

const PROVINCE_ABBR: Record<string, string> = {
    "Alberta": "AB",
    "British Columbia": "BC",
    "Manitoba": "MB",
    "New Brunswick": "NB",
    "Newfoundland and Labrador": "NL",
    "Northwest Territories": "NT",
    "Nova Scotia": "NS",
    "Nunavut": "NU",
    "Ontario": "ON",
    "Prince Edward Island": "PE",
    "Quebec": "QC",
    "Québec": "QC",
    "Saskatchewan": "SK",
    "Yukon": "YT",
    "Yukon Territory": "YT",
}

const PROVINCES = [
    { code: "AB", label: "Alberta" },
    { code: "BC", label: "British Columbia" },
    { code: "MB", label: "Manitoba" },
    { code: "NB", label: "New Brunswick" },
    { code: "NL", label: "Newfoundland and Labrador" },
    { code: "NS", label: "Nova Scotia" },
    { code: "NT", label: "Northwest Territories" },
    { code: "NU", label: "Nunavut" },
    { code: "ON", label: "Ontario" },
    { code: "PE", label: "Prince Edward Island" },
    { code: "QC", label: "Quebec" },
    { code: "SK", label: "Saskatchewan" },
    { code: "YT", label: "Yukon" },
]

interface AddressBlockProps {
    value: AddressValue
    onChange: (v: AddressValue) => void
    line1Error?: string
    required?: boolean
}

export const AddressBlock: React.FC<AddressBlockProps> = ({ value, onChange, line1Error, required }) => {
    const { t } = useTranslation()
    const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(e: MouseEvent): void {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    function handleLine1Change(raw: string): void {
        onChange({ ...value, line1: raw })
        if (raw.length < 3) {
            setSuggestions([])
            setShowSuggestions(false)
            return
        }
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
            try {
                const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(raw)}&countrycodes=ca&addressdetails=1&format=json&limit=5`
                const res = await fetch(url, { headers: { "User-Agent": "Autonomo/1.0" } })
                const data: NominatimResult[] = await res.json()
                setSuggestions(data)
                setShowSuggestions(data.length > 0)
            } catch {
                setSuggestions([])
            }
        }, 400)
    }

    function handleSelect(result: NominatimResult): void {
        const addr = result.address
        const houseNumber = addr.house_number ? `${addr.house_number} ` : ""
        const road = addr.road ?? ""
        const line1 = `${houseNumber}${road}`.trim() || result.display_name.split(",")[0].trim()
        const city = addr.city ?? addr.town ?? addr.village ?? addr.suburb ?? addr.county ?? ""
        const provinceAbbr = PROVINCE_ABBR[addr.state ?? ""] ?? value.province
        const postalCode = addr.postcode ? maskPostalCode(addr.postcode) : value.postalCode
        onChange({ line1, line2: value.line2, city, province: provinceAbbr, postalCode })
        setSuggestions([])
        setShowSuggestions(false)
    }

    return (
        <div className="space-y-3">
            <div ref={containerRef} className="relative space-y-1">
                <label className="text-sm font-medium">
                    {t("address.line1")}{required ? " *" : ""}
                </label>
                <input
                    value={value.line1}
                    onChange={(e) => handleLine1Change(e.target.value)}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
                    className={cn(inputCn, line1Error && "border-destructive")}
                    placeholder={t("address.line1Placeholder")}
                    autoComplete="off"
                />
                {line1Error ? <p className="text-destructive text-xs">{line1Error}</p> : null}
                {showSuggestions ? (
                    <ul className="bg-background border-border absolute z-50 mt-1 w-full rounded-md border shadow-lg">
                        {suggestions.map((s, i) => (
                            <li
                                key={i}
                                onMouseDown={() => handleSelect(s)}
                                className="hover:bg-accent cursor-pointer truncate px-3 py-2 text-sm"
                            >
                                {s.display_name}
                            </li>
                        ))}
                    </ul>
                ) : null}
            </div>

            <div className="space-y-1">
                <label className="text-sm font-medium">{t("address.line2")}</label>
                <input
                    value={value.line2}
                    onChange={(e) => onChange({ ...value, line2: e.target.value })}
                    className={inputCn}
                    placeholder={t("address.line2Placeholder")}
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-sm font-medium">{t("address.city")}</label>
                    <input
                        value={value.city}
                        onChange={(e) => onChange({ ...value, city: e.target.value })}
                        className={inputCn}
                        placeholder={t("address.cityPlaceholder")}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium">{t("address.province")}</label>
                    <select
                        value={value.province}
                        onChange={(e) => onChange({ ...value, province: e.target.value })}
                        className={selectCn}
                    >
                        <option value="">—</option>
                        {PROVINCES.map((p) => (
                            <option key={p.code} value={p.code}>{p.code} — {p.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="w-40 space-y-1">
                <label className="text-sm font-medium">{t("address.postalCode")}</label>
                <input
                    value={value.postalCode}
                    onChange={(e) => onChange({ ...value, postalCode: maskPostalCode(e.target.value) })}
                    className={cn(inputCn, "uppercase")}
                    placeholder="A1B 2C3"
                    maxLength={7}
                />
            </div>
        </div>
    )
}

const inputCn =
    "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"

const selectCn =
    "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
