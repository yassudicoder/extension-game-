import type { Animal, EarnLedger, LastAwardAt, PetState } from './types'
import { todayKey } from './time'

// ---- storage ----
export const STORAGE_KEY = 'petState'
export const SCHEMA_VERSION = 1

export const ANIMALS: Animal[] = ['cat', 'dog', 'bunny']
export const ANIMAL_LABELS: Record<Animal, string> = {
  cat: 'Cat',
  dog: 'Dog',
  bunny: 'Bunny',
}
const CORNERS = ['tl', 'tr', 'bl', 'br'] as const

// ---- wellbeing tuning (all gentle + forgiving by construction) ----
export const WELLBEING_FLOOR = 30 // hard floor; the pet never drops into distress
export const WELLBEING_START = 70 // a fresh, well-rested pet (= blend of the defaults below)
export const WELLBEING_MAX = 100

// ---- water reminders ----
export const DEFAULT_REMINDER_MIN = 90
export const MIN_REMINDER_MIN = 30
export const MAX_REMINDER_MIN = 240
export const DEFAULT_SNOOZE_MIN = 20

// ---- work/break breather ----
export const DEFAULT_BREAK_MIN = 50
export const MIN_BREAK_MIN = 25
export const MAX_BREAK_MIN = 120

/** A fresh state for a brand-new install (or after Reset). */
export function defaultState(now: number): PetState {
  return {
    schemaVersion: SCHEMA_VERSION,
    animal: 'cat',
    position: { corner: 'br', dx: 24, dy: 24 },
    hidden: false,
    // hydration + nourishment start at their no-input baselines; rest starts full,
    // so the derived wellbeing = 0.3*40 + 0.25*50 + 0.45*100 = 70 (calm, content).
    stats: { hydration: 40, nourishment: 50, rest: 100, wellbeing: WELLBEING_START },
    lastWaterAt: null,
    waterLog: [],
    lastFedAt: null,
    snackLog: [],
    sleepMode: false,
    sleepUntil: null,
    activityState: 'active',
    lastActiveAt: now,
    reminderIntervalMin: DEFAULT_REMINDER_MIN,
    remindersEnabled: true,
    lastReminderAt: null,
    breakRemindersEnabled: true,
    breakIntervalMin: DEFAULT_BREAK_MIN,
    lastBreakAt: now,
    snoozeUntil: null,
    lastNudgeAt: null,
    installedAt: now,
    lastTickAt: now,
    todaysWins: { date: todayKey(now), water: 0, snacks: 0, breaks: 0, pets: 0 },
    history: [],
    biscuits: 0,
    earnLedger: { date: todayKey(now), water: 0, snacks: 0, pets: 0, breaks: 0, time: 0 },
    lastAwardAt: { water: null, snack: null, pet: null },
    lastNightBonusDate: null,
    ownedPets: [...ANIMALS],
    inventory: {},
    placed: [],
  }
}

/**
 * Forward-only migration. Any stored object is merged over the current defaults so
 * that fields added in newer versions get sane values, then the version is bumped.
 * Nested objects are merged explicitly so their new sub-fields also get defaults.
 */
export function migrate(raw: unknown, now: number): PetState {
  const base = defaultState(now)
  if (!raw || typeof raw !== 'object') return base

  const incoming = raw as Partial<PetState>
  const merged: PetState = { ...base, ...incoming }
  merged.stats = { ...base.stats, ...(incoming.stats ?? {}) }
  merged.position = { ...base.position, ...(incoming.position ?? {}) }
  merged.todaysWins = { ...base.todaysWins, ...(incoming.todaysWins ?? {}) }
  merged.waterLog = Array.isArray(incoming.waterLog) ? incoming.waterLog : base.waterLog
  merged.snackLog = Array.isArray(incoming.snackLog) ? incoming.snackLog : base.snackLog
  merged.history = Array.isArray(incoming.history) ? incoming.history : base.history

  // Validate enum-ish fields so a corrupt stored object can't poison the UI.
  if (!ANIMALS.includes(merged.animal)) merged.animal = base.animal
  if (!CORNERS.includes(merged.position.corner)) merged.position = base.position

  // Economy / collection: default + sanitise for older stored objects.
  merged.biscuits = typeof incoming.biscuits === 'number' ? Math.max(0, incoming.biscuits) : 0
  const num0 = (v: unknown): number => (typeof v === 'number' && v >= 0 ? v : 0)
  const tsOrNull = (v: unknown): number | null => (typeof v === 'number' && v >= 0 ? v : null)
  const el = (
    incoming.earnLedger && typeof incoming.earnLedger === 'object' ? incoming.earnLedger : {}
  ) as Partial<EarnLedger>
  merged.earnLedger = {
    date: typeof el.date === 'string' ? el.date : base.earnLedger.date,
    water: num0(el.water),
    snacks: num0(el.snacks),
    pets: num0(el.pets),
    breaks: num0(el.breaks),
    time: num0(el.time),
  }
  const la = (
    incoming.lastAwardAt && typeof incoming.lastAwardAt === 'object' ? incoming.lastAwardAt : {}
  ) as Partial<LastAwardAt>
  merged.lastAwardAt = { water: tsOrNull(la.water), snack: tsOrNull(la.snack), pet: tsOrNull(la.pet) }
  merged.lastNightBonusDate =
    typeof incoming.lastNightBonusDate === 'string' ? incoming.lastNightBonusDate : null
  const owned = Array.isArray(incoming.ownedPets)
    ? incoming.ownedPets.filter((a): a is Animal => ANIMALS.includes(a as Animal))
    : []
  merged.ownedPets = owned.length > 0 ? Array.from(new Set(owned)) : [...ANIMALS]
  merged.inventory =
    incoming.inventory && typeof incoming.inventory === 'object' && !Array.isArray(incoming.inventory)
      ? (incoming.inventory as Record<string, number>)
      : {}
  merged.placed = Array.isArray(incoming.placed) ? incoming.placed : []

  // installedAt: prefer the stored value, else an existing user's lastTickAt, else now.
  merged.installedAt =
    typeof incoming.installedAt === 'number'
      ? incoming.installedAt
      : typeof incoming.lastTickAt === 'number'
        ? incoming.lastTickAt
        : base.installedAt

  merged.schemaVersion = SCHEMA_VERSION
  return merged
}
