import { useState, useRef, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Fingerprint, Lock } from "lucide-react"
import logo from "../../assets/logo.png"

interface LockScreenProps {
    onUnlock: () => void
    touchIdEnabled?: boolean
}

export function LockScreen({ onUnlock, touchIdEnabled = false }: LockScreenProps): JSX.Element {
    const { t } = useTranslation()
    const [pin, setPin] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const [touchIdAvailable, setTouchIdAvailable] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        async function init(): Promise<void> {
            if (!touchIdEnabled) {
                inputRef.current?.focus()
                return
            }
            const res = await window.api.touchIdAvailable()
            const available = res.success && (res.data as boolean)
            setTouchIdAvailable(available)
            if (available) {
                await attemptTouchId()
            } else {
                inputRef.current?.focus()
            }
        }
        init().catch(() => inputRef.current?.focus())
    }, [])

    async function attemptTouchId(): Promise<void> {
        setLoading(true)
        setError("")
        const result = await window.api.promptTouchId()
        if (result.success) {
            onUnlock()
        } else {
            setError(t("security.touchIdFailed"))
            setLoading(false)
            inputRef.current?.focus()
        }
    }

    async function handleSubmit(e: React.FormEvent): Promise<void> {
        e.preventDefault()
        if (!pin.trim()) return
        setLoading(true)
        setError("")
        const result = await window.api.verifyPin(pin)
        if (result.success && (result.data as { valid: boolean }).valid) {
            onUnlock()
        } else {
            setError(t("security.wrongPin"))
            setPin("")
            setLoading(false)
            inputRef.current?.focus()
        }
    }

    return (
        <div className="flex h-screen flex-col items-center justify-center bg-background">
            <div className="w-full max-w-sm space-y-6 px-6">
                <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                        <img src={logo} alt="Autonomo" className="h-16 w-16 rounded-2xl" />
                        <div className="bg-background absolute -bottom-1 -right-1 rounded-full p-1">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                        </div>
                    </div>
                    <h1 className="text-xl font-semibold">Autonomo</h1>
                    <p className="text-muted-foreground text-sm">{t("security.enterPin")}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        ref={inputRef}
                        type="password"
                        inputMode="numeric"
                        value={pin}
                        onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError("") }}
                        placeholder={t("security.pinPlaceholder")}
                        autoComplete="current-password"
                        className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-11 w-full rounded-md border px-4 py-2 text-center text-sm tracking-widest focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    />
                    {error ? (
                        <p className="text-destructive text-center text-sm">{error}</p>
                    ) : null}
                    <button
                        type="submit"
                        disabled={loading || !pin.trim()}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium disabled:opacity-50"
                    >
                        {loading ? t("common.loading") : t("security.unlock")}
                    </button>
                </form>

                {touchIdEnabled && touchIdAvailable ? (
                    <button
                        type="button"
                        onClick={attemptTouchId}
                        disabled={loading}
                        className="flex w-full flex-col items-center gap-1 py-2 disabled:opacity-50"
                    >
                        <Fingerprint className="text-primary h-8 w-8" />
                        <span className="text-muted-foreground text-xs">{t("security.touchId")}</span>
                    </button>
                ) : null}
            </div>
        </div>
    )
}
