import type { ActivityState, PetMood, PetState } from './types'
import { HOUR, MINUTE, isNight, nextMorning, todayKey } from './time'
import {
  WELLBEING_FLOOR,
  WELLBEING_MAX,
  MIN_REMINDER_MIN,
  MAX_REMINDER_MIN,
} from './schema'

// =============================================================================
// Pocket Pet wellbeing model — FORGIVING BY CONSTRUCTION.
//
// Guarantees enforced here (and covered by unit tests):
//   1. Wellbeing is ALWAYS clamped to [WELLBEING_FLOOR, 100]. It can never reach a
//      "distress"/zero state. There is no death and no sickness.
//   2. Wellbeing RISES EASILY (large fraction of the gap closed per hour when the
//      target is above current) and DECAYS SLOWLY + GENTLY (a small fraction per
//      hour when below).
//   3. All decay is computed from elapsed wall-clock time (now - lastTickAt), NOT
//      from a count of ticks — so a suspended/killed service worker never changes
//      the outcome. Missing a tick is harmless.
//   4. Resting (sleep / idle / locked) is GOOD: it recovers rest and is never
//      penalised.
//
// Every function is pure: (state, now, ...) -> new state. No I/O, no Date.now().
// =============================================================================

// ---- tuning ----
const HYDRATION_WINDOW = 10 * HOUR // waters older than this no longer count
const HYDRATION_BASE = 40 // hydration with no recent water (gentle, never 0)
const HYDRATION_PER_WATER = 22 // peak contribution of one fresh glass

const REST_FLOOR = 45
const REST_RECOVER_PER_HOUR = 12 // while resting
const REST_DECAY_PER_HOUR = 6 // while continuously active

const RISE_K = 2.5 // wellbeing approach rate when improving (fast)
const DECAY_K = 0.12 // wellbeing approach rate when declining (slow + gentle)

const WATER_WELLBEING_BONUS = 6 // immediate visible reward for logging water
const PET_WELLBEING_BONUS = 2 // small affection nudge (capped, not a grind)

const BREAK_MIN_MS = 3 * MINUTE // a rest this long or longer counts as a "break" win

const HISTORY_MAX = 60 // keep ~2 months of daily rollups

// ---- tiny helpers ----
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
const round = (v: number) => Math.round(v)
const isResting = (s: PetState): boolean =>
  s.sleepMode || s.activityState === 'idle' || s.activityState === 'locked'

/** Hydration in [0,100], derived purely from the water log and `now`. */
export function computeHydration(waterLog: number[], now: number): number {
  let score = HYDRATION_BASE
  for (const t of waterLog) {
    const age = now - t
    if (age < 0 || age > HYDRATION_WINDOW) continue
    const recency = 1 - age / HYDRATION_WINDOW // 1 (just now) -> 0 (window edge)
    score += HYDRATION_PER_WATER * recency
  }
  return clamp(score, 0, 100)
}

/**
 * Move `current` toward `target` over `hours`, fast when rising and slow when
 * falling. Exponential approach so it never overshoots.
 */
function approach(current: number, target: number, hours: number): number {
  const gap = target - current
  if (gap === 0 || hours <= 0) return current
  const k = gap > 0 ? RISE_K : DECAY_K
  return current + gap * (1 - Math.exp(-k * hours))
}

/** Roll the "today's wins" counter and append a history entry when the day changes. */
function rolloverIfNeeded(s: PetState, now: number): PetState {
  const today = todayKey(now)
  if (s.todaysWins.date === today) return s
  const history = [
    ...s.history,
    {
      date: s.todaysWins.date,
      wellbeingAvg: round(s.stats.wellbeing),
      waters: s.todaysWins.water,
    },
  ].slice(-HISTORY_MAX)
  return {
    ...s,
    history,
    todaysWins: { date: today, water: 0, breaks: 0, pets: 0 },
  }
}

/**
 * The integrator. Brings the state up to `now`: prunes the water log, recomputes
 * hydration + rest from elapsed time, eases wellbeing toward its target, rolls the
 * day over, and re-anchors lastTickAt. Safe to call any number of times.
 */
export function applyTick(state: PetState, now: number): PetState {
  let s = rolloverIfNeeded(state, now)
  const hours = Math.max(0, now - s.lastTickAt) / HOUR

  s = { ...s, waterLog: s.waterLog.filter((t) => t <= now && now - t <= HYDRATION_WINDOW) }

  const hydration = computeHydration(s.waterLog, now)

  const resting = isResting(s)
  let rest = s.stats.rest
  rest = resting
    ? Math.min(100, rest + REST_RECOVER_PER_HOUR * hours)
    : Math.max(REST_FLOOR, rest - REST_DECAY_PER_HOUR * hours)

  const target = clamp(0.5 * hydration + 0.5 * rest, WELLBEING_FLOOR, WELLBEING_MAX)
  const wellbeing = clamp(approach(s.stats.wellbeing, target, hours), WELLBEING_FLOOR, WELLBEING_MAX)

  return {
    ...s,
    stats: { hydration: round(hydration), rest: round(rest), wellbeing: round(wellbeing) },
    lastTickAt: now,
  }
}

/** Log a glass of water: instant hydration + a small visible wellbeing bump. */
export function applyWater(state: PetState, now: number): PetState {
  const s = applyTick(state, now)
  const waterLog = [...s.waterLog, now]
  const hydration = computeHydration(waterLog, now)
  const wellbeing = clamp(s.stats.wellbeing + WATER_WELLBEING_BONUS, WELLBEING_FLOOR, WELLBEING_MAX)
  return {
    ...s,
    waterLog,
    lastWaterAt: now,
    snoozeUntil: null,
    lastNudgeAt: null, // drinking clears any pending nudge
    stats: { ...s.stats, hydration: round(hydration), wellbeing: round(wellbeing) },
    todaysWins: { ...s.todaysWins, water: s.todaysWins.water + 1 },
  }
}

/** Pet the pet: a small, capped affection nudge. */
export function applyPet(state: PetState, now: number): PetState {
  const s = applyTick(state, now)
  const wellbeing = clamp(s.stats.wellbeing + PET_WELLBEING_BONUS, WELLBEING_FLOOR, WELLBEING_MAX)
  return {
    ...s,
    stats: { ...s.stats, wellbeing: round(wellbeing) },
    todaysWins: { ...s.todaysWins, pets: s.todaysWins.pets + 1 },
  }
}

/** Apply a chrome.idle state change; credit a "break" when returning from rest. */
export function applyActivity(state: PetState, now: number, activity: ActivityState): PetState {
  const wasResting = isResting(state)
  const restedMs = now - state.lastTickAt
  const s = applyTick(state, now)
  let todaysWins = s.todaysWins
  let lastActiveAt = s.lastActiveAt
  if (activity === 'active') {
    if (wasResting && restedMs >= BREAK_MIN_MS) {
      todaysWins = { ...todaysWins, breaks: todaysWins.breaks + 1 }
    }
    lastActiveAt = now
  }
  return { ...s, activityState: activity, lastActiveAt, todaysWins }
}

/** Toggle manual "good night" sleep; schedules an auto-wake for the morning. */
export function applySleep(state: PetState, now: number, on: boolean): PetState {
  const s = applyTick(state, now)
  return { ...s, sleepMode: on, sleepUntil: on ? nextMorning(now) : null }
}

/** Auto-wake from "good night" once the morning target has passed. */
export function maybeWake(state: PetState, now: number): PetState {
  if (state.sleepMode && state.sleepUntil != null && now >= state.sleepUntil) {
    return { ...state, sleepMode: false, sleepUntil: null }
  }
  return state
}

/** Update reminder settings, clamping the interval to a sane range. */
export function applyReminderSettings(
  state: PetState,
  now: number,
  intervalMin: number,
  enabled: boolean,
): PetState {
  const s = applyTick(state, now)
  return {
    ...s,
    reminderIntervalMin: clamp(Math.round(intervalMin), MIN_REMINDER_MIN, MAX_REMINDER_MIN),
    remindersEnabled: enabled,
  }
}

/** Snooze reminders for `minutes`. */
export function applySnooze(state: PetState, now: number, minutes: number): PetState {
  const s = applyTick(state, now)
  return { ...s, snoozeUntil: now + Math.max(1, minutes) * MINUTE, lastNudgeAt: null }
}

/**
 * Should a gentle water reminder fire right now? Deliberately conservative — we
 * never nag while the user is away, asleep, snoozed, or has reminders off.
 */
export function reminderDue(state: PetState, now: number): boolean {
  if (!state.remindersEnabled) return false
  if (state.sleepMode) return false
  if (state.activityState !== 'active') return false
  if (state.snoozeUntil != null && now < state.snoozeUntil) return false

  const intervalMs = state.reminderIntervalMin * MINUTE
  // Anchor off the most recent of "last drank" / "last reminded"; drinking resets it.
  const anchor = Math.max(state.lastWaterAt ?? 0, state.lastReminderAt ?? 0)
  if (anchor === 0) return now - state.lastTickAt >= intervalMs
  return now - anchor >= intervalMs
}

/** Derive the persistent animation mood. Lowest mood is "sleepy" — never sick. */
export function petMood(state: PetState, now: number): PetMood {
  if (isResting(state)) return 'sleeping'
  const w = state.stats.wellbeing
  if (w >= 85 && !isNight(now)) return 'happy'
  if (w >= 60) return 'content'
  return 'sleepy'
}

/** Warm, low-pressure description of wellbeing. Never scolding. */
export function describeWellbeing(state: PetState): string {
  if (state.sleepMode) return 'fast asleep · sweet dreams 🌙'
  if (state.activityState !== 'active') return 'resting while you’re away 💤'
  const w = state.stats.wellbeing
  if (w >= 85) return 'happy and hydrated ✨'
  if (w >= 70) return 'content and cozy'
  if (w >= 55) return 'doing just fine'
  if (w >= 40) return 'a little sleepy — a glass of water would be lovely'
  return 'taking it easy — be gentle with yourself today 💛'
}
