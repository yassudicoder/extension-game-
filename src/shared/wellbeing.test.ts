import { describe, it, expect } from 'vitest'
import {
  applyTick,
  applyWater,
  applyPet,
  applyActivity,
  applySleep,
  maybeWake,
  applySnooze,
  applyReminderSettings,
  reminderDue,
  computeHydration,
  petMood,
  describeWellbeing,
} from './wellbeing'
import { defaultState, WELLBEING_FLOOR, WELLBEING_MAX } from './schema'
import { HOUR, MINUTE, DAY, nextMorning } from './time'

const T0 = new Date('2026-06-17T09:00:00').getTime() // a fixed, deterministic "now"

describe('forgiving guarantees', () => {
  it('never drops wellbeing below the floor, even after weeks of total neglect', () => {
    let s = defaultState(T0)
    // 30 days idle-but-not-resting, never any water, never petted.
    s = { ...s, activityState: 'active' }
    s = applyTick(s, T0 + 30 * DAY)
    expect(s.stats.wellbeing).toBeGreaterThanOrEqual(WELLBEING_FLOOR)
    expect(s.stats.wellbeing).toBeLessThanOrEqual(WELLBEING_MAX)
  })

  it('decays slowly: after 1 hour of neglect it barely moves', () => {
    const s = defaultState(T0)
    const after = applyTick(s, T0 + HOUR)
    // gentle: loses only a few points in an hour
    expect(s.stats.wellbeing - after.stats.wellbeing).toBeLessThan(8)
  })

  it('rises easily: hydration target is reached fast once you drink', () => {
    let s = defaultState(T0)
    // start low so there is room to rise
    s = { ...s, stats: { ...s.stats, wellbeing: 40, hydration: 40, rest: 80 } }
    s = applyWater(s, T0)
    s = applyWater(s, T0 + 5 * MINUTE)
    s = applyTick(s, T0 + HOUR) // one hour later, rising fast
    expect(s.stats.wellbeing).toBeGreaterThan(60)
  })

  it('clamps wellbeing at the max', () => {
    let s = defaultState(T0)
    s = { ...s, stats: { ...s.stats, wellbeing: 99 } }
    for (let i = 0; i < 10; i++) s = applyWater(s, T0 + i * MINUTE)
    expect(s.stats.wellbeing).toBeLessThanOrEqual(WELLBEING_MAX)
  })
})

describe('time-based decay is independent of tick count', () => {
  it('one big tick == many small ticks over the same span (SW suspension is harmless)', () => {
    const start = defaultState(T0)
    const oneBig = applyTick(start, T0 + 6 * HOUR)

    let many = start
    for (let i = 1; i <= 36; i++) many = applyTick(many, T0 + i * 10 * MINUTE) // 36 * 10min = 6h
    // identical: rest is linear+clamped and hydration is closed-form, so cadence
    // cannot change the outcome.
    expect(many.stats.wellbeing).toBe(oneBig.stats.wellbeing)
    expect(many.stats.rest).toBe(oneBig.stats.rest)
  })
})

describe('hydration', () => {
  it('is gentle (never zero) with no water and rises with recent water', () => {
    expect(computeHydration([], T0)).toBeGreaterThan(0)
    const withWater = computeHydration([T0, T0 - 30 * MINUTE], T0)
    expect(withWater).toBeGreaterThan(computeHydration([], T0))
  })

  it('drops old waters out of the window', () => {
    const stale = computeHydration([T0 - 20 * HOUR], T0) // older than the 10h window
    expect(stale).toBeCloseTo(computeHydration([], T0), 5)
  })

  it('applyWater prunes stale entries and records the win', () => {
    let s = defaultState(T0)
    s = { ...s, waterLog: [T0 - 20 * HOUR] } // stale
    s = applyWater(s, T0)
    expect(s.waterLog).toEqual([T0]) // stale pruned, fresh kept
    expect(s.todaysWins.water).toBe(1)
    expect(s.lastWaterAt).toBe(T0)
  })
})

describe('rest & activity', () => {
  it('resting recovers rest and is never penalised', () => {
    let s = defaultState(T0)
    s = { ...s, stats: { ...s.stats, rest: 50 }, activityState: 'idle' }
    s = applyTick(s, T0 + 2 * HOUR)
    expect(s.stats.rest).toBeGreaterThan(50)
  })

  it('credits a break when returning to active after a real rest', () => {
    let s = defaultState(T0)
    s = applyActivity(s, T0, 'idle') // go idle
    s = applyActivity(s, T0 + 30 * MINUTE, 'active') // come back after 30 min
    expect(s.todaysWins.breaks).toBe(1)
    expect(s.activityState).toBe('active')
  })

  it('does not credit a break for a momentary blip', () => {
    let s = defaultState(T0)
    s = applyActivity(s, T0, 'idle')
    s = applyActivity(s, T0 + 30_000, 'active') // only 30s
    expect(s.todaysWins.breaks).toBe(0)
  })
})

describe('sleep mode', () => {
  it('schedules a morning auto-wake and wakes once it passes', () => {
    let s = defaultState(T0)
    s = applySleep(s, T0, true)
    expect(s.sleepMode).toBe(true)
    expect(s.sleepUntil).toBe(nextMorning(T0))

    const beforeMorning = maybeWake(s, (s.sleepUntil ?? 0) - MINUTE)
    expect(beforeMorning.sleepMode).toBe(true)

    const afterMorning = maybeWake(s, (s.sleepUntil ?? 0) + MINUTE)
    expect(afterMorning.sleepMode).toBe(false)
    expect(afterMorning.sleepUntil).toBeNull()
  })
})

describe('reminders', () => {
  it('is not due before the interval and is due after', () => {
    let s = defaultState(T0)
    s = applyReminderSettings(s, T0, 90, true)
    s = { ...s, lastWaterAt: T0 }
    expect(reminderDue(s, T0 + 60 * MINUTE)).toBe(false)
    expect(reminderDue(s, T0 + 100 * MINUTE)).toBe(true)
  })

  it('never fires while away, asleep, snoozed, or disabled', () => {
    const base = { ...defaultState(T0), lastWaterAt: T0 - 5 * HOUR }
    expect(reminderDue({ ...base, activityState: 'idle' }, T0)).toBe(false)
    expect(reminderDue({ ...base, sleepMode: true }, T0)).toBe(false)
    expect(reminderDue({ ...base, remindersEnabled: false }, T0)).toBe(false)
    const snoozed = applySnooze(base, T0, 20)
    expect(reminderDue(snoozed, T0 + 5 * MINUTE)).toBe(false)
    expect(reminderDue(snoozed, T0 + 25 * MINUTE)).toBe(true)
  })

  it('clamps the configured interval to the allowed range', () => {
    let s = defaultState(T0)
    s = applyReminderSettings(s, T0, 5, true) // below minimum
    expect(s.reminderIntervalMin).toBeGreaterThanOrEqual(30)
    s = applyReminderSettings(s, T0, 9999, true) // above maximum
    expect(s.reminderIntervalMin).toBeLessThanOrEqual(240)
  })
})

describe('mood & copy are never punishing', () => {
  it('lowest mood is "sleepy", never sick/dead', () => {
    let s = defaultState(T0)
    s = { ...s, activityState: 'active', stats: { ...s.stats, wellbeing: WELLBEING_FLOOR } }
    expect(petMood(s, T0)).toBe('sleepy')
  })

  it('resting always shows the sleeping mood', () => {
    const s = { ...defaultState(T0), activityState: 'idle' as const }
    expect(petMood(s, T0)).toBe('sleeping')
  })

  it('copy stays warm even at the floor (no shame words)', () => {
    const s = {
      ...defaultState(T0),
      activityState: 'active' as const,
      stats: { hydration: 10, rest: 10, wellbeing: WELLBEING_FLOOR },
    }
    const text = describeWellbeing(s).toLowerCase()
    expect(text).toMatch(/gentle|easy|💛/)
    expect(text).not.toMatch(/sick|dying|dead|bad|fail|lazy/)
  })

  it('petting nudges up but is small and capped', () => {
    // normalise first so `before` is the derived value, then pet.
    let s = applyTick({ ...defaultState(T0), stats: { hydration: 40, rest: 70, wellbeing: 0 } }, T0)
    const before = s.stats.wellbeing
    s = applyPet(s, T0)
    expect(s.stats.wellbeing).toBeGreaterThanOrEqual(before)
    expect(s.stats.wellbeing - before).toBeLessThanOrEqual(3)
    expect(s.todaysWins.pets).toBe(1)
  })
})
