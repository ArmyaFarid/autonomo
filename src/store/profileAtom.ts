import { atom } from "jotai"
import type { Profile } from "../types/definitions"

export const profileAtom = atom<Profile | null>(null)
export const isFirstLaunchAtom = atom<boolean>(false)
export const appReadyAtom = atom<boolean>(false)
export const backupToastAtom = atom<string | null>(null)
export const isLockedAtom = atom<boolean>(false)
