import type { Animal, PetPosition, PetState } from './types'

/**
 * The full message contract between popup / content script and the service worker.
 * The service worker is the single writer to storage, so every state mutation is
 * expressed as one of these messages.
 */
export const MSG = {
  DRANK_WATER: 'DRANK_WATER',
  FED: 'FED',
  PET_CLICKED: 'PET_CLICKED',
  TOGGLE_SLEEP: 'TOGGLE_SLEEP',
  SET_ANIMAL: 'SET_ANIMAL',
  SET_REMINDER: 'SET_REMINDER',
  SET_BREAK: 'SET_BREAK',
  SNOOZE_REMINDER: 'SNOOZE_REMINDER',
  SET_POSITION: 'SET_POSITION',
  SET_HIDDEN: 'SET_HIDDEN',
  RESET: 'RESET',
  GET_STATE: 'GET_STATE',
} as const

export type MsgType = (typeof MSG)[keyof typeof MSG]

export type Message =
  | { type: typeof MSG.DRANK_WATER }
  | { type: typeof MSG.FED }
  | { type: typeof MSG.PET_CLICKED }
  | { type: typeof MSG.TOGGLE_SLEEP; on: boolean }
  | { type: typeof MSG.SET_ANIMAL; animal: Animal }
  | { type: typeof MSG.SET_REMINDER; intervalMin: number; enabled: boolean }
  | { type: typeof MSG.SET_BREAK; intervalMin: number; enabled: boolean }
  | { type: typeof MSG.SNOOZE_REMINDER; minutes: number }
  | { type: typeof MSG.SET_POSITION; position: PetPosition }
  | { type: typeof MSG.SET_HIDDEN; hidden: boolean }
  | { type: typeof MSG.RESET }
  | { type: typeof MSG.GET_STATE }

export interface MsgResponse {
  ok: boolean
  /** The full, freshly-computed state after the action (for optimistic UI). */
  state?: PetState
  error?: string
}

/** Typed send helper (popup / content → service worker). Never throws. */
export async function sendMessage(msg: Message): Promise<MsgResponse> {
  try {
    const res = (await chrome.runtime.sendMessage(msg)) as MsgResponse | undefined
    return res ?? { ok: false, error: 'no response from service worker' }
  } catch (e) {
    // The SW may be momentarily unavailable, or there's no receiver on this page.
    return { ok: false, error: String(e) }
  }
}
