// The farm runs on the visitor's real clock — a shared helper so the hero greeting,
// the initial day/night skin, and the footer sign-off all speak in the same breath.
export interface Daypart {
  time: 'day' | 'night'
  greeting: string
  signoff: string
}

export function daypart(now: Date = new Date()): Daypart {
  const h = now.getHours()
  if (h < 6) return { time: 'night', greeting: 'Late one? The coop’s still warm.', signoff: 'tonight' }
  if (h < 12) return { time: 'day', greeting: 'Morning — the kettle’s on.', signoff: 'this morning' }
  if (h < 17) return { time: 'day', greeting: 'Afternoon. Mind the bees.', signoff: 'this afternoon' }
  if (h < 20) return { time: 'day', greeting: 'Evening — lanterns soon.', signoff: 'this evening' }
  return { time: 'night', greeting: 'Evening. The lanterns are lit.', signoff: 'tonight' }
}

/** Which season it is on the visitor's clock — drives the §5 "now" badge. */
export function season(now: Date = new Date()): 'Spring' | 'Summer' | 'Autumn' | 'Winter' {
  const m = now.getMonth() // 0 = Jan
  if (m <= 1 || m === 11) return 'Winter'
  if (m <= 4) return 'Spring'
  if (m <= 7) return 'Summer'
  return 'Autumn'
}
