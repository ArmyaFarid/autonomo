import { atom } from "jotai"
import type { Client } from "../types/definitions"

export const clientsAtom = atom<Client[]>([])
