import { atom } from "jotai"
import type { Invoice } from "../types/definitions"

export const invoicesAtom = atom<Invoice[]>([])
