// All shared TypeScript types for Pocket Pet.

export type Animal = 'cat' | 'dog' | 'bunny'

/** Raw activity reported by chrome.idle. */
export type ActivityState = 'active' | 'idle' | 'locked'

/**
 * Visible mood used to drive the pet's animation. Derived from stored state
 * (never punishing — the lowest derived mood is "sleepy", never "sick").
 */
export type PetMood = 'happy' | 'content' | 'sleepy' | 'sleeping'

/** Transient one-shot reactions triggered by events (not persisted). */
export type PetReaction = 'celebrate' | 'drink' | 'nudge'

export interface PetPosition {
  /** Which screen corner the pet is anchored to (survives viewport resizes). */
  corner: 'tl' | 'tr' | 'bl' | 'br'
  /** Offset in px from that corner. */
  dx: number
  dy: number
}

export interface Stats {
  /** 0–100. Recent hydration, derived from the water log. */
  hydration: number
  /** 0–100. Rest / break balance. */
  rest: number
  /** 0–100, always clamped to >= WELLBEING_FLOOR. The overall, forgiving value. */
  wellbeing: number
}

export interface TodaysWins {
  /** YYYY-MM-DD local date this counter belongs to. */
  date: string
  water: number
  breaks: number
  pets: number
}

export interface HistoryEntry {
  date: string
  wellbeingAvg: number
  waters: number
}

export interface PetState {
  /** Storage schema version, for forward-only migration. */
  schemaVersion: number

  // --- identity & placement ---
  animal: Animal
  position: PetPosition
  hidden: boolean

  // --- wellbeing ---
  stats: Stats

  // --- hydration ---
  /** epoch ms of the most recent water log, or null. */
  lastWaterAt: number | null
  /** epoch ms of recent waters, windowed to the hydration window. Feeds hydration. */
  waterLog: number[]

  // --- rest / activity ---
  /** Manual "good night" toggle. */
  sleepMode: boolean
  /** epoch ms target to auto-wake "in the morning", or null. */
  sleepUntil: number | null
  /** Last known chrome.idle state. */
  activityState: ActivityState
  /** epoch ms of the last time the user was active. */
  lastActiveAt: number

  // --- reminders ---
  reminderIntervalMin: number
  remindersEnabled: boolean
  lastReminderAt: number | null
  /** epoch ms until which reminders are snoozed, or null. */
  snoozeUntil: number | null
  /** epoch ms of the last soft nudge; the content overlay watches this to animate. */
  lastNudgeAt: number | null

  // --- bookkeeping ---
  /** epoch ms anchor for time-based wellbeing decay (survives service-worker death). */
  lastTickAt: number
  todaysWins: TodaysWins
  history: HistoryEntry[]
}
