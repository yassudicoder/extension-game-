// Small, pure time helpers. Everything takes an explicit `now` (epoch ms) so the
// logic stays deterministic and unit-testable.

export const MINUTE = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000

/** Local hour (inclusive) at which the pet auto-wakes from "good night". */
export const MORNING_HOUR = 7
/** Local hour after which we consider it "night" for a gentle evening mood. */
export const NIGHT_HOUR = 22

/** Local YYYY-MM-DD key for grouping "today". */
export function todayKey(now: number): string {
  const d = new Date(now)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Epoch ms of the next MORNING_HOUR:00 strictly after `now`.
 * Used to schedule "sleep until morning" without setTimeout — we just store the
 * timestamp and check it on each alarm tick.
 */
export function nextMorning(now: number): number {
  const morning = new Date(now)
  morning.setHours(MORNING_HOUR, 0, 0, 0)
  if (morning.getTime() <= now) {
    morning.setDate(morning.getDate() + 1)
  }
  return morning.getTime()
}

/** True when it's "night" by local hour (used only for a softer evening mood). */
export function isNight(now: number): boolean {
  const h = new Date(now).getHours()
  return h >= NIGHT_HOUR || h < MORNING_HOUR
}
