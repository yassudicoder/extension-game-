import type { Animal, PetState } from './types'
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

// ---- wellbeing tuning (all gentle + forgiving by construction) ----
export const WELLBEING_FLOOR = 30 // hard floor; the pet never drops into distress
export const WELLBEING_START = 70 // a fresh, well-rested pet (= blend of the defaults below)
export const WELLBEING_MAX = 100

// ---- reminders ----
export const DEFAULT_REMINDER_MIN = 90
export const MIN_REMINDER_MIN = 30
export const MAX_REMINDER_MIN = 240
export const DEFAULT_SNOOZE_MIN = 20

/** A fresh state for a brand-new install (or after Reset). */
export function defaultState(now: number): PetState {
  return {
    schemaVersion: SCHEMA_VERSION,
    animal: 'cat',
    position: { corner: 'br', dx: 24, dy: 24 },
    hidden: false,
    // hydration starts at its no-water baseline; rest starts full, so the derived
    // wellbeing = 0.5*40 + 0.5*100 = 70 (a calm, content new pet).
    stats: { hydration: 40, rest: 100, wellbeing: WELLBEING_START },
    lastWaterAt: null,
    waterLog: [],
    sleepMode: false,
    sleepUntil: null,
    activityState: 'active',
    lastActiveAt: now,
    reminderIntervalMin: DEFAULT_REMINDER_MIN,
    remindersEnabled: true,
    lastReminderAt: null,
    snoozeUntil: null,
    lastNudgeAt: null,
    lastTickAt: now,
    todaysWins: { date: todayKey(now), water: 0, breaks: 0, pets: 0 },
    history: [],
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
  merged.history = Array.isArray(incoming.history) ? incoming.history : base.history
  merged.schemaVersion = SCHEMA_VERSION
  return merged
}
