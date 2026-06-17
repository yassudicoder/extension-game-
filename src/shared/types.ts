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
  /** 0–100. Recent nourishment, derived from the snack log. */
  nourishment: number
  /** 0–100. Rest / break balance. */
  rest: number
  /** 0–100, always clamped to >= WELLBEING_FLOOR. The overall, forgiving value. */
  wellbeing: number
}

export interface TodaysWins {
  /** YYYY-MM-DD local date this counter belongs to. */
  date: string
  water: number
  snacks: number
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

  // --- nourishment (snacks/meals) ---
  /** epoch ms of the most recent feed, or null. */
  lastFedAt: number | null
  /** epoch ms of recent snacks, windowed. Feeds nourishment. */
  snackLog: number[]

  // --- rest / activity ---
  /** Manual "good night" toggle. */
  sleepMode: boolean
  /** epoch ms target to auto-wake "in the morning", or null. */
  sleepUntil: number | null
  /** Last known chrome.idle state. */
  activityState: ActivityState
  /** epoch ms of the last time the user was active. */
  lastActiveAt: number

  // --- water reminders ---
  reminderIntervalMin: number
  remindersEnabled: boolean
  lastReminderAt: number | null

  // --- gentle work/break breather (Pomodoro-ish) ---
  breakRemindersEnabled: boolean
  breakIntervalMin: number
  /** epoch ms anchor for the next break nudge; reset when a real break/snack happens. */
  lastBreakAt: number | null
  /** epoch ms until which reminders are snoozed, or null. */
  snoozeUntil: number | null
  /** epoch ms of the last soft nudge; the content overlay watches this to animate. */
  lastNudgeAt: number | null

  // --- bookkeeping ---
  /** epoch ms of first install; the baseline for the very first reminder, before
   *  the user has ever logged water or been reminded. */
  installedAt: number
  /** epoch ms anchor for time-based wellbeing decay (survives service-worker death). */
  lastTickAt: number
  todaysWins: TodaysWins
  history: HistoryEntry[]

  // --- economy & collection (Phase 1 foundation; Phase 2 shop / Phase 3 house use the rest) ---
  /** Biscuit balance — in-game currency, no real money. Always clamped >= 0. */
  biscuits: number
  /** Biscuits earned today from the time trickle; capped per day, reset on rollover. */
  earnedTodayFromTime: number
  /** YYYY-MM-DD the good-night bonus was last awarded (caps it to once per day). */
  lastNightBonusDate: string | null
  /** Pets the user owns and can set as the active pet. */
  ownedPets: Animal[]
  /** Owned shop items: itemId -> quantity. Empty until Phase 2. */
  inventory: Record<string, number>
  /** Item ids placed in the house. Empty until Phase 3. */
  placed: string[]
}
