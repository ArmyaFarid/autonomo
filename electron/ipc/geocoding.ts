import { ipcMain } from "electron"
import { net } from "electron"

export function registerGeocodingHandlers(): void {
    ipcMain.handle("geocoding:search", async (_event, query: string) => {
        try {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=ca&addressdetails=1&format=json&limit=5`
            const response = await net.fetch(url, {
                headers: { "User-Agent": "Autonomo/1.0 (contact@autonomo.app)" },
            })
            const data = await response.json()
            return { success: true, data }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })
}
