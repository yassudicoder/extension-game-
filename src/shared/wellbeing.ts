import type { ActivityState, PetMood, PetState } from './types'
import { HOUR, MINUTE, isNight, nextMorning, todayKey } from './time'
import {
  WELLBEING_FLOOR,
  WELLBEING_MAX,
  MIN_REMINDER_MIN,
  MAX_REMINDER_MIN,
  MIN_BREAK_MIN,
  MAX_BREAK_MIN,
} from './schema'

// =============================================================================
// Pocket Pet wellbeing model — FORGIVING BY CONSTRUCTION.
//
// Guarantees enforced here (and covered by unit tests):
//   1. Wellbeing is ALWAYS clamped to [WELLBEING_FLOOR, 100]. It can never reach a
//      "distress"/zero state. There is no death and no sickness. In practice it
//      doesn't even approach the floor under neglect — it settles around the low
//      50s — but the clamp is a hard guarantee.
//   2. Wellbeing is a PURE function of two inputs:
//        - hydration: derived directly from the (timestamped) water log,
//        - rest: a gentle reservoir that recovers while resting and ebbs slowly
//          while continuously active.
//      Because both inputs are computed from elapsed wall-clock time (never from a
//      count of ticks), the result is identical whether the service worker ticked
//      every 5 minutes or was suspended for hours. Missing a tick is harmless.
//   3. It RISES EASILY (water instantly lifts hydration; rest recovers at 12/hr)
//      and DECAYS SLOWLY + GENTLY (rest ebbs at only 6/hr; hydration can't fall
//      below a kind baseline) — so the most it can drift down is a few points/hour.
//   4. Resting (sleep / idle / locked) is GOOD: it recovers rest and is never
//      penalised.
//
// Every function is pure: (state, now, ...) -> new state. No I/O, no Date.now().
// =============================================================================

// ---- tuning ----
const HYDRATION_WINDOW = 10 * HOUR // waters older than this no longer count
const HYDRATION_BASE = 40 // hydration with no recent water (gentle, never 0)
const HYDRATION_PER_WATER = 22 // peak contribution of one fresh glass

const NOURISH_WINDOW = 8 * HOUR // snacks older than this no longer count
const NOURISH_BASE = 50 // nourishment with no recent snack (gentle — never "hungry")
const NOURISH_PER_SNACK = 18 // peak contribution of one fresh snack

const REST_FLOOR = 45
const REST_CEIL = 100
const REST_RECOVER_PER_HOUR = 12 // while resting
const REST_DECAY_PER_HOUR = 6 // while continuously active

// wellbeing = blend of the three inputs. The asymmetry of "rises fast, falls slow"
// comes from the inputs themselves (water/snacks lift instantly, then ebb gently).
const W_HYDRATION = 0.3
const W_REST = 0.45
const W_NOURISH = 0.25

const PET_REST_BONUS = 4 // affection is restful (small, naturally capped by REST_CEIL)
const BREAK_MIN_MS = 3 * MINUTE // a rest at least this long counts as a "break" win
const HISTORY_MAX = 60 // keep ~2 months of daily rollups

// ---- biscuit (currency) rewards ----
// Self-care earns the most; passive screen time earns least and is capped — a
// wellness pet shouldn't reward you for staring at the screen instead of resting.
const BISCUITS_WATER = 3
const BISCUITS_SNACK = 2
const BISCUITS_BREAK = 5
const BISCUITS_PET = 1
const BISCUITS_NIGHT = 5 // good-night while it's actually late, once per day
const BISCUITS_TIME_CAP = 20 // max biscuits/day from the passive time trickle

// Anti-farming: a click only PAYS when both a per-type cooldown has elapsed since
// the last *paid* action AND today's per-source cap (in biscuits) has headroom.
// The action itself (animation, stats, win counter) always happens — only the
// payout is gated.
// TODO: for real/paid currency this is NOT enough — chrome.storage is fully
// user-editable, so the balance and these earning rules MUST be validated and
// enforced server-side. Client-side gating only deters casual spam-farming.
const WATER_COOLDOWN_MS = 15 * MINUTE
const WATER_CAP = 9
const SNACK_COOLDOWN_MS = 30 * MINUTE
const SNACK_CAP = 6
const PET_COOLDOWN_MS = 10 * MINUTE
const PET_CAP = 5
const BREAK_CAP = 20 // break already needs a real idle→active gap; just cap the total

// ---- tiny helpers ----
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
const round = (v: number) => Math.round(v)
const isResting = (s: PetState): boolean =>
  s.sleepMode || s.activityState === 'idle' || s.activityState === 'locked'
/** Add biscuits, never letting the balance go below zero. */
const addBiscuits = (balance: number, n: number): number => Math.max(0, balance + n)

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

/** Nourishment in [0,100], derived purely from the snack log and `now`. */
export function computeNourishment(snackLog: number[], now: number): number {
  let score = NOURISH_BASE
  for (const t of snackLog) {
    const age = now - t
    if (age < 0 || age > NOURISH_WINDOW) continue
    const recency = 1 - age / NOURISH_WINDOW
    score += NOURISH_PER_SNACK * recency
  }
  return clamp(score, 0, 100)
}

/** Wellbeing as a pure blend of hydration + rest + nourishment. Within [FLOOR, MAX]. */
export function deriveWellbeing(hydration: number, rest: number, nourishment: number): number {
  return clamp(
    round(W_HYDRATION * hydration + W_REST * rest + W_NOURISH * nourishment),
    WELLBEING_FLOOR,
    WELLBEING_MAX,
  )
}

/** Integrate rest over `hours` of constant activity (linear, clamped). */
function stepRest(rest: number, hours: number, resting: boolean): number {
  const next = resting
    ? rest + REST_RECOVER_PER_HOUR * hours
    : rest - REST_DECAY_PER_HOUR * hours
  return clamp(next, REST_FLOOR, REST_CEIL)
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
    todaysWins: { date: today, water: 0, snacks: 0, breaks: 0, pets: 0 },
    earnLedger: { date: today, water: 0, snacks: 0, pets: 0, breaks: 0, time: 0 }, // reset daily caps
  }
}

/**
 * Bring the state up to `now`: prune the water log, recompute hydration, ebb/recover
 * rest for the elapsed time, derive wellbeing, roll the day over, re-anchor
 * lastTickAt. Idempotent and cadence-independent — safe to call any number of times.
 */
export function applyTick(state: PetState, now: number): PetState {
  let s = rolloverIfNeeded(state, now)
  const hours = Math.max(0, now - s.lastTickAt) / HOUR

  s = {
    ...s,
    waterLog: s.waterLog.filter((t) => t <= now && now - t <= HYDRATION_WINDOW),
    snackLog: s.snackLog.filter((t) => t <= now && now - t <= NOURISH_WINDOW),
  }

  const hydration = computeHydration(s.waterLog, now)
  const nourishment = computeNourishment(s.snackLog, now)
  const rest = stepRest(s.stats.rest, hours, isResting(s))
  const wellbeing = deriveWellbeing(hydration, rest, nourishment)

  return {
    ...s,
    stats: {
      hydration: round(hydration),
      nourishment: round(nourishment),
      rest: round(rest),
      wellbeing,
    },
    lastTickAt: now,
  }
}

/**
 * Decide a cooldown-gated payout. Returns updated biscuits / ledger / award stamp.
 * Pays only if the per-type cooldown has elapsed since the last paid action AND the
 * source's daily cap has headroom; otherwise returns the balance unchanged.
 */
function tryAward(
  s: PetState,
  now: number,
  ledgerKey: 'water' | 'snacks' | 'pets',
  lastKey: 'water' | 'snack' | 'pet',
  reward: number,
  cooldownMs: number,
  cap: number,
): Pick<PetState, 'biscuits' | 'earnLedger' | 'lastAwardAt'> {
  const last = s.lastAwardAt[lastKey]
  const cooled = last == null || now - last >= cooldownMs
  if (!cooled || s.earnLedger[ledgerKey] >= cap) {
    return { biscuits: s.biscuits, earnLedger: s.earnLedger, lastAwardAt: s.lastAwardAt }
  }
  return {
    biscuits: addBiscuits(s.biscuits, reward),
    earnLedger: { ...s.earnLedger, [ledgerKey]: s.earnLedger[ledgerKey] + reward },
    lastAwardAt: { ...s.lastAwardAt, [lastKey]: now },
  }
}

/** Log a glass of water: instantly lifts hydration (and therefore wellbeing). */
export function applyWater(state: PetState, now: number): PetState {
  const s = applyTick(state, now)
  const waterLog = [...s.waterLog, now]
  const hydration = computeHydration(waterLog, now)
  return {
    ...s,
    waterLog,
    lastWaterAt: now,
    snoozeUntil: null,
    lastNudgeAt: null, // drinking clears any pending nudge
    stats: {
      ...s.stats,
      hydration: round(hydration),
      wellbeing: deriveWellbeing(hydration, s.stats.rest, s.stats.nourishment),
    },
    todaysWins: { ...s.todaysWins, water: s.todaysWins.water + 1 },
    ...tryAward(s, now, 'water', 'water', BISCUITS_WATER, WATER_COOLDOWN_MS, WATER_CAP),
  }
}

/** Feed a snack/meal: instantly lifts nourishment. Pure reward — never "hungry". */
export function applyFeed(state: PetState, now: number): PetState {
  const s = applyTick(state, now)
  const snackLog = [...s.snackLog, now]
  const nourishment = computeNourishment(snackLog, now)
  return {
    ...s,
    snackLog,
    lastFedAt: now,
    lastBreakAt: now, // a snack counts as taking your break
    lastNudgeAt: null,
    stats: {
      ...s.stats,
      nourishment: round(nourishment),
      wellbeing: deriveWellbeing(s.stats.hydration, s.stats.rest, nourishment),
    },
    todaysWins: { ...s.todaysWins, snacks: s.todaysWins.snacks + 1 },
    ...tryAward(s, now, 'snacks', 'snack', BISCUITS_SNACK, SNACK_COOLDOWN_MS, SNACK_CAP),
  }
}

/** Pet the pet: a small, naturally-capped affection bump (via rest). */
export function applyPet(state: PetState, now: number): PetState {
  const s = applyTick(state, now)
  const rest = clamp(s.stats.rest + PET_REST_BONUS, REST_FLOOR, REST_CEIL)
  return {
    ...s,
    stats: {
      ...s.stats,
      rest: round(rest),
      wellbeing: deriveWellbeing(s.stats.hydration, rest, s.stats.nourishment),
    },
    todaysWins: { ...s.todaysWins, pets: s.todaysWins.pets + 1 },
    ...tryAward(s, now, 'pets', 'pet', BISCUITS_PET, PET_COOLDOWN_MS, PET_CAP),
  }
}

/**
 * Apply a chrome.idle state change; credit a "break" when returning from rest.
 * Break length is measured from `lastActiveAt` (the moment activity last changed),
 * NOT `lastTickAt` — the 5-minute tick keeps resetting lastTickAt, which used to
 * make long breaks look short and undercount them. `lastActiveAt` is updated on
 * every transition, so on idle→active it holds the instant the rest began.
 */
export function applyActivity(state: PetState, now: number, activity: ActivityState): PetState {
  const wasResting = isResting(state)
  const restedMs = now - state.lastActiveAt
  const s = applyTick(state, now)
  let todaysWins = s.todaysWins
  let lastBreakAt = s.lastBreakAt
  let biscuits = s.biscuits
  let earnLedger = s.earnLedger
  if (activity === 'active' && wasResting && restedMs >= BREAK_MIN_MS) {
    todaysWins = { ...todaysWins, breaks: todaysWins.breaks + 1 }
    lastBreakAt = now // an actual break resets the breather timer
    if (earnLedger.breaks < BREAK_CAP) {
      biscuits = addBiscuits(biscuits, BISCUITS_BREAK)
      earnLedger = { ...earnLedger, breaks: earnLedger.breaks + BISCUITS_BREAK }
    }
  }
  return { ...s, activityState: activity, lastActiveAt: now, todaysWins, lastBreakAt, biscuits, earnLedger }
}

/** Toggle manual "good night" sleep; schedules an auto-wake, and rewards a real
 *  night-time good-night once per day. */
export function applySleep(state: PetState, now: number, on: boolean): PetState {
  const s = applyTick(state, now)
  const today = todayKey(now)
  let biscuits = s.biscuits
  let lastNightBonusDate = s.lastNightBonusDate
  if (on && isNight(now) && lastNightBonusDate !== today) {
    biscuits = addBiscuits(biscuits, BISCUITS_NIGHT)
    lastNightBonusDate = today
  }
  return {
    ...s,
    sleepMode: on,
    sleepUntil: on ? nextMorning(now) : null,
    biscuits,
    lastNightBonusDate,
  }
}

/**
 * Passive currency trickle: +1 biscuit while the user is active and awake, capped
 * per day. Call ONLY from the periodic service-worker tick (never from applyTick,
 * which runs on every action and would over-reward).
 */
export function applyTimeTrickle(state: PetState, now: number): PetState {
  const s = rolloverIfNeeded(state, now) // keep the daily cap fresh
  if (s.sleepMode || s.activityState !== 'active') return s
  if (s.earnLedger.time >= BISCUITS_TIME_CAP) return s
  return {
    ...s,
    biscuits: addBiscuits(s.biscuits, 1),
    earnLedger: { ...s.earnLedger, time: s.earnLedger.time + 1 },
  }
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
  // For a user who has never done either, anchor on install time — NOT lastTickAt,
  // which the 5-minute tick keeps resetting (that bug meant the first reminder never
  // fired for someone who'd never logged water).
  const anchor = Math.max(state.lastWaterAt ?? 0, state.lastReminderAt ?? 0)
  if (anchor === 0) return now - state.installedAt >= intervalMs
  return now - anchor >= intervalMs
}

/** Update break-breather settings, clamping the interval to a sane range. */
export function applyBreakSettings(
  state: PetState,
  now: number,
  intervalMin: number,
  enabled: boolean,
): PetState {
  const s = applyTick(state, now)
  return {
    ...s,
    breakIntervalMin: clamp(Math.round(intervalMin), MIN_BREAK_MIN, MAX_BREAK_MIN),
    breakRemindersEnabled: enabled,
  }
}

/**
 * Is a gentle break-breather nudge due? Like reminders: never while away, asleep,
 * snoozed, or disabled. Anchored on the last real break/snack (or install).
 */
export function breakDue(state: PetState, now: number): boolean {
  if (!state.breakRemindersEnabled) return false
  if (state.sleepMode) return false
  if (state.activityState !== 'active') return false
  if (state.snoozeUntil != null && now < state.snoozeUntil) return false
  const intervalMs = state.breakIntervalMin * MINUTE
  const anchor = state.lastBreakAt ?? state.installedAt
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
