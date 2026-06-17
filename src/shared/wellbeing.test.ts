import { describe, it, expect } from 'vitest'
import {
  applyTick,
  applyWater,
  applyFeed,
  applyPet,
  applyActivity,
  applySleep,
  maybeWake,
  applySnooze,
  applyReminderSettings,
  reminderDue,
  applyBreakSettings,
  breakDue,
  applyTimeTrickle,
  computeHydration,
  computeNourishment,
  petMood,
  describeWellbeing,
} from './wellbeing'
import { defaultState, migrate, WELLBEING_FLOOR, WELLBEING_MAX } from './schema'
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

  it('measures break length from lastActiveAt, not the 5-min tick (long breaks count)', () => {
    let s = defaultState(T0)
    s = applyActivity(s, T0, 'idle') // step away
    // the periodic tick keeps firing while idle — this must NOT shorten the break
    s = applyTick(s, T0 + 20 * MINUTE)
    s = applyTick(s, T0 + 40 * MINUTE)
    s = applyActivity(s, T0 + 45 * MINUTE, 'active') // back after 45 min
    expect(s.todaysWins.breaks).toBe(1)
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

  it('fires for a fresh user who has never logged water (anchored on install)', () => {
    const s = defaultState(T0) // active, reminders on, no water, no prior reminder
    expect(reminderDue(s, T0 + 60 * MINUTE)).toBe(false)
    expect(reminderDue(s, T0 + 91 * MINUTE)).toBe(true)
  })
})

describe('feed (nourishment) is a pure reward — never punishing', () => {
  it('feeding lifts nourishment + wellbeing and logs a snack', () => {
    let s = defaultState(T0)
    const before = s.stats.wellbeing
    s = applyFeed(s, T0)
    expect(s.stats.nourishment).toBeGreaterThan(50)
    expect(s.stats.wellbeing).toBeGreaterThanOrEqual(before)
    expect(s.todaysWins.snacks).toBe(1)
    expect(s.lastFedAt).toBe(T0)
  })

  it('never goes "hungry": nourishment rests at a gentle baseline, never 0', () => {
    expect(computeNourishment([], T0)).toBeGreaterThanOrEqual(50)
    const stale = computeNourishment([T0 - 20 * HOUR], T0) // older than the window
    expect(stale).toBeCloseTo(50, 5)
  })
})

describe('break breather', () => {
  it('is due after the interval for a fresh active user, and a real break resets it', () => {
    let s = defaultState(T0) // breakRemindersEnabled + active by default
    expect(breakDue(s, T0 + 30 * MINUTE)).toBe(false)
    expect(breakDue(s, T0 + 55 * MINUTE)).toBe(true)
    s = applyActivity(s, T0 + 55 * MINUTE, 'idle')
    s = applyActivity(s, T0 + 70 * MINUTE, 'active') // 15-min rest → credited break
    expect(breakDue(s, T0 + 80 * MINUTE)).toBe(false)
  })

  it('never fires while away, asleep, or disabled', () => {
    const base = { ...defaultState(T0), lastBreakAt: T0 - 2 * HOUR }
    expect(breakDue(base, T0)).toBe(true)
    expect(breakDue({ ...base, activityState: 'idle' }, T0)).toBe(false)
    expect(breakDue({ ...base, sleepMode: true }, T0)).toBe(false)
    expect(breakDue({ ...base, breakRemindersEnabled: false }, T0)).toBe(false)
  })

  it('clamps the break interval to its allowed range', () => {
    let s = applyBreakSettings(defaultState(T0), T0, 5, true)
    expect(s.breakIntervalMin).toBeGreaterThanOrEqual(25)
    s = applyBreakSettings(s, T0, 9999, true)
    expect(s.breakIntervalMin).toBeLessThanOrEqual(120)
  })
})

describe('biscuits (currency)', () => {
  it('awards the right amount per win', () => {
    expect(applyWater(defaultState(T0), T0).biscuits).toBe(3)
    expect(applyFeed(defaultState(T0), T0).biscuits).toBe(2)
    expect(applyPet(defaultState(T0), T0).biscuits).toBe(1)
    let s = applyActivity(defaultState(T0), T0, 'idle')
    s = applyActivity(s, T0 + 30 * MINUTE, 'active') // a real break
    expect(s.biscuits).toBe(5)
  })

  it('rewards a real night-time good-night once per day', () => {
    const night = new Date('2026-06-17T23:30:00').getTime()
    let s = applySleep(defaultState(night), night, true)
    expect(s.biscuits).toBe(5)
    s = applySleep(s, night + MINUTE, false)
    s = applySleep(s, night + 2 * MINUTE, true) // same night → no double pay
    expect(s.biscuits).toBe(5)
  })

  it('does not pay the night bonus during the day', () => {
    const day = new Date('2026-06-17T14:00:00').getTime()
    expect(applySleep(defaultState(day), day, true).biscuits).toBe(0)
  })

  it('time trickle pays while active, caps at 20/day, and resets the next day', () => {
    let s = defaultState(T0) // active by default
    for (let i = 0; i < 30; i++) s = applyTimeTrickle(s, T0 + i * 5 * MINUTE)
    expect(s.earnLedger.time).toBe(20)
    expect(s.biscuits).toBe(20)
    s = applyTimeTrickle(s, T0 + DAY) // new day → cap resets, trickle resumes
    expect(s.earnLedger.time).toBe(1)
    expect(s.biscuits).toBe(21)
  })

  it('never trickles while idle or asleep, and never goes negative', () => {
    expect(applyTimeTrickle({ ...defaultState(T0), activityState: 'idle' }, T0).biscuits).toBe(0)
    expect(applyTimeTrickle({ ...defaultState(T0), sleepMode: true }, T0).biscuits).toBe(0)
    expect(defaultState(T0).biscuits).toBeGreaterThanOrEqual(0)
  })
})

describe('earning is exploit-resistant (spam-proof)', () => {
  it('spam-clicking water pays once within the cooldown — but stats/wins still update', () => {
    let s = defaultState(T0)
    s = applyWater(s, T0)
    s = applyWater(s, T0 + MINUTE)
    s = applyWater(s, T0 + 2 * MINUTE)
    expect(s.biscuits).toBe(3) // only the first click paid
    expect(s.todaysWins.water).toBe(3) // every click still counts as a win
    expect(s.waterLog.length).toBe(3) // hydration still updates each click
    s = applyWater(s, T0 + 16 * MINUTE) // past the 15-min cooldown
    expect(s.biscuits).toBe(6)
  })

  it('honours the snack (30m) and pet (10m) cooldowns', () => {
    let snack = applyFeed(defaultState(T0), T0)
    snack = applyFeed(snack, T0 + 10 * MINUTE) // within cooldown
    expect(snack.biscuits).toBe(2)
    expect(snack.todaysWins.snacks).toBe(2)

    let pet = applyPet(defaultState(T0), T0)
    pet = applyPet(pet, T0 + 5 * MINUTE) // within cooldown
    expect(pet.biscuits).toBe(1)
    expect(pet.todaysWins.pets).toBe(2)
  })

  it('stops paying water at the daily cap and resets next day', () => {
    let s = defaultState(T0)
    for (let i = 0; i < 8; i++) s = applyWater(s, T0 + i * 16 * MINUTE) // past cooldown each time
    expect(s.earnLedger.water).toBe(9) // cap = 9 (3 paid waters)
    expect(s.biscuits).toBe(9)
    s = applyWater(s, T0 + DAY) // new day resets the cap
    expect(s.earnLedger.water).toBe(3)
    expect(s.biscuits).toBe(12)
  })

  it('caps break earnings at 20/day while still counting every break as a win', () => {
    let s = defaultState(T0)
    for (let i = 0; i < 5; i++) {
      s = applyActivity(s, T0 + i * HOUR, 'idle')
      s = applyActivity(s, T0 + i * HOUR + 30 * MINUTE, 'active') // a real 30-min break
    }
    expect(s.todaysWins.breaks).toBe(5) // all five credited as wins
    expect(s.earnLedger.breaks).toBe(20) // but biscuit earnings capped at 20
  })
})

describe('migrate validates stored data', () => {
  it('falls back to defaults for a corrupt animal / corner', () => {
    const fixed = migrate({ animal: 'dragon', position: { corner: 'xx', dx: 5, dy: 5 } }, T0)
    expect(fixed.animal).toBe('cat')
    expect(fixed.position.corner).toBe('br')
  })

  it('keeps valid stored values', () => {
    const ok = migrate({ animal: 'bunny', position: { corner: 'tl', dx: 10, dy: 12 } }, T0)
    expect(ok.animal).toBe('bunny')
    expect(ok.position).toEqual({ corner: 'tl', dx: 10, dy: 12 })
  })

  it('seeds installedAt from an existing user’s lastTickAt', () => {
    const migrated = migrate({ lastTickAt: T0 - 5 * DAY }, T0)
    expect(migrated.installedAt).toBe(T0 - 5 * DAY)
  })

  it('defaults the economy/collection fields for an old stored object', () => {
    const m = migrate({ animal: 'cat' }, T0)
    expect(m.biscuits).toBe(0)
    expect(m.earnLedger).toEqual({ date: m.earnLedger.date, water: 0, snacks: 0, pets: 0, breaks: 0, time: 0 })
    expect(typeof m.earnLedger.date).toBe('string')
    expect(m.lastAwardAt).toEqual({ water: null, snack: null, pet: null })
    expect(m.lastNightBonusDate).toBeNull()
    expect(m.ownedPets).toEqual(['cat', 'dog', 'bunny'])
    expect(m.inventory).toEqual({})
    expect(m.placed).toEqual([])
  })

  it('sanitises a corrupt ownedPets list (drops unknowns, dedupes)', () => {
    const m = migrate({ ownedPets: ['cat', 'dragon', 'cat'] }, T0)
    expect(m.ownedPets).toEqual(['cat'])
  })

  it('sanitises a corrupt earn ledger and award timestamps', () => {
    const m = migrate(
      { earnLedger: { date: 5, water: -3, snacks: 2 }, lastAwardAt: { water: 'x', pet: 1000 } },
      T0,
    )
    expect(m.earnLedger.water).toBe(0) // negative -> 0
    expect(m.earnLedger.snacks).toBe(2) // valid kept
    expect(m.earnLedger.time).toBe(0) // missing -> 0
    expect(typeof m.earnLedger.date).toBe('string') // bad date -> default string
    expect(m.lastAwardAt.water).toBeNull() // non-number -> null
    expect(m.lastAwardAt.pet).toBe(1000) // valid kept
    expect(m.lastAwardAt.snack).toBeNull() // missing -> null
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
      stats: { hydration: 10, nourishment: 10, rest: 10, wellbeing: WELLBEING_FLOOR },
    }
    const text = describeWellbeing(s).toLowerCase()
    expect(text).toMatch(/gentle|easy|💛/)
    expect(text).not.toMatch(/sick|dying|dead|bad|fail|lazy/)
  })

  it('petting nudges up but is small and capped', () => {
    // normalise first so `before` is the derived value, then pet.
    let s = applyTick(
      { ...defaultState(T0), stats: { hydration: 40, nourishment: 50, rest: 70, wellbeing: 0 } },
      T0,
    )
    const before = s.stats.wellbeing
    s = applyPet(s, T0)
    expect(s.stats.wellbeing).toBeGreaterThanOrEqual(before)
    expect(s.stats.wellbeing - before).toBeLessThanOrEqual(3)
    expect(s.todaysWins.pets).toBe(1)
  })
})
