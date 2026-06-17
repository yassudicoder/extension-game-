// chrome.alarms is the ONLY scheduling primitive we use. setTimeout/setInterval do
// not survive service-worker suspension, so they are never used here.
//
// A single periodic alarm drives everything:
//   - the wellbeing tick (recompute from timestamps),
//   - the "sleep until morning" auto-wake check,
//   - the gentle water-reminder check.
// One alarm is enough because all of those are timestamp comparisons; the 5-minute
// cadence only bounds how promptly we react, never the correctness of the math.

export const ALARM_TICK = 'pocket-pet-tick'
export const TICK_PERIOD_MIN = 5

/** Create the tick alarm if it doesn't already exist (idempotent, never resets it). */
export async function ensureAlarms(): Promise<void> {
  const existing = await chrome.alarms.get(ALARM_TICK)
  if (!existing) {
    await chrome.alarms.create(ALARM_TICK, {
      periodInMinutes: TICK_PERIOD_MIN,
      delayInMinutes: TICK_PERIOD_MIN,
    })
  }
}
