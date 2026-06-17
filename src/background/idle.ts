import type { ActivityState } from '../shared/types'

// chrome.idle maps the user's presence to the pet's rest. 'idle' and 'locked' both
// mean "the user stepped away" → the pet rests (which is always a good thing here).
// The detection interval must be >= 15s; 60s is gentle and avoids over-reacting to
// brief pauses.
export const IDLE_DETECTION_SEC = 60

/** Wire up idle detection. Call once at top level on every service-worker wake. */
export function registerIdle(onChange: (state: ActivityState) => void): void {
  chrome.idle.setDetectionInterval(IDLE_DETECTION_SEC)
  chrome.idle.onStateChanged.addListener((state) => onChange(state as ActivityState))
}
