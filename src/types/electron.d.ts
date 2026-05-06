import type { ElectronAPI } from "../../electron/preload"

declare global {
    interface Window {
        api: ElectronAPI
    }
}

declare module "*.png" {
    const src: string
    export default src
}
