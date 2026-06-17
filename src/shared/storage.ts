import type { PetState } from './types'
import { STORAGE_KEY, migrate } from './schema'

// chrome.storage.local is the SINGLE source of truth for all extension state.
// (We never use localStorage: it is unavailable in the service worker, and the
// content script's localStorage belongs to the host page.)

/** Load + migrate the current state. */
export async function loadState(now: number): Promise<PetState> {
  const obj = await chrome.storage.local.get(STORAGE_KEY)
  return migrate(obj[STORAGE_KEY], now)
}

/** Persist the full state object. */
export async function saveState(state: PetState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state })
}

/**
 * Subscribe to state changes. UI surfaces (popup + content) use this to stay in
 * sync; they must NEVER write back to storage inside the callback (that would
 * create a feedback loop) — all writes go through the service worker.
 * Returns an unsubscribe function.
 */
export function onStateChanged(cb: (state: PetState) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area !== 'local') return
    const change = changes[STORAGE_KEY]
    if (change && change.newValue) cb(change.newValue as PetState)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
