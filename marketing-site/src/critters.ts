// Reusable animated farm critters sprinkled through the content sections, so the
// pets/animals aren't all bunched in the hero. Each critter reveals + animates
// only while it's on screen (perf + a little delight on scroll), and falls back to
// a single static frame under prefers-reduced-motion. Pets reuse the 32px idle
// sheets; the cow + chickens are single-row strips from the Pixel Farm Demo pack.
//
// Animation reuses the global `pp-cycle` keyframe (defined in hero.css), which just
// sweeps background-position-x to var(--pp-x1) — perfect for a horizontal strip.
import cowIdleUrl from './assets/scene/PixelFarmDEMO/Animals/cow_idle.png'
import cowWalkUrl from './assets/scene/PixelFarmDEMO/Animals/cow_walk.png'
import chickPeckUrl from './assets/scene/PixelFarmDEMO/Animals/Chicken_B_pecking.png'
import chickWalkUrl from './assets/scene/PixelFarmDEMO/Animals/Chicken_B_walk.png'
import chickIdleUrl from './assets/scene/PixelFarmDEMO/Animals/Chicken_B_Idle.png'
import catUrl from './assets/sprites/cat.png'
import dogUrl from './assets/sprites/dog.png'
import bunnyUrl from './assets/sprites/bunny.png'

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface Strip {
  url: string
  fw: number
  fh: number
  frames: number
  fps: number
}
const STRIPS: Record<string, Strip> = {
  cowIdle: { url: cowIdleUrl, fw: 25, fh: 22, frames: 5, fps: 3 },
  cowWalk: { url: cowWalkUrl, fw: 26, fh: 22, frames: 5, fps: 7 },
  chickPeck: { url: chickPeckUrl, fw: 10, fh: 10, frames: 2, fps: 5 },
  chickWalk: { url: chickWalkUrl, fw: 10, fh: 11, frames: 4, fps: 9 },
  chickIdle: { url: chickIdleUrl, fw: 12, fh: 11, frames: 4, fps: 4 },
}
const PETS: Record<string, string> = { cat: catUrl, dog: dogUrl, bunny: bunnyUrl }

/** Pause a critter's CSS animation whenever it scrolls out of view. */
function playOnlyWhenVisible(el: HTMLElement): void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) el.style.animationPlayState = en.isIntersecting ? 'running' : 'paused'
    },
    { threshold: 0.12 },
  )
  io.observe(el)
}

interface CritterOpts {
  scale: number
  css: Partial<CSSStyleDeclaration> // absolute placement within the (relative) container
  flip?: boolean // face right (strips/pets default to facing left)
  z?: number
  shadow?: boolean
  mobileHide?: boolean // drop on narrow phones to avoid crowding copy
  slow?: boolean // pets: a drowsy ~2.4s idle instead of 1s (e.g. the sleeping cat)
}

/** A strip critter (cow / chicken) looping a single animation in place. */
function mountStrip(parent: HTMLElement, key: keyof typeof STRIPS, opts: CritterOpts): HTMLElement {
  const s = STRIPS[key]
  const e = document.createElement('div')
  e.className = 'sx-critter'
  Object.assign(e.style, {
    position: 'absolute',
    width: `${s.fw * opts.scale}px`,
    height: `${s.fh * opts.scale}px`,
    backgroundImage: `url(${s.url})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${s.fw * s.frames * opts.scale}px ${s.fh * opts.scale}px`,
    imageRendering: 'pixelated',
    zIndex: String(opts.z ?? 2),
    transform: opts.flip ? 'scaleX(-1)' : '',
    ...opts.css,
  })
  if (opts.shadow !== false) e.style.filter = 'drop-shadow(0 3px 2px rgba(59, 46, 38, 0.26))'
  if (opts.mobileHide) e.dataset.hide = 'm'
  parent.appendChild(e)
  if (reduce) {
    e.style.backgroundPositionX = '0px'
    return e
  }
  e.style.setProperty('--pp-x1', `${-s.frames * s.fw * opts.scale}px`)
  e.style.animation = `pp-cycle ${(s.frames / s.fps).toFixed(2)}s steps(${s.frames}) infinite`
  e.style.animationPlayState = 'paused'
  playOnlyWhenVisible(e)
  return e
}

/** A pet (cat/dog/bunny) looping its idle row (row 0, 4 frames) in place. */
function mountPet(parent: HTMLElement, key: 'cat' | 'dog' | 'bunny', opts: CritterOpts): HTMLElement {
  const cell = 32
  const e = document.createElement('div')
  e.className = 'sx-critter'
  Object.assign(e.style, {
    position: 'absolute',
    width: `${cell * opts.scale}px`,
    height: `${cell * opts.scale}px`,
    backgroundImage: `url(${PETS[key]})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${192 * opts.scale}px ${160 * opts.scale}px`,
    backgroundPosition: '0 0',
    imageRendering: 'pixelated',
    zIndex: String(opts.z ?? 2),
    transform: opts.flip ? 'scaleX(-1)' : '',
    ...opts.css,
  })
  if (opts.shadow !== false) e.style.filter = 'drop-shadow(0 3px 2px rgba(59, 46, 38, 0.26))'
  if (opts.mobileHide) e.dataset.hide = 'm'
  parent.appendChild(e)
  if (reduce) return e
  e.style.setProperty('--pp-x1', `${-4 * cell * opts.scale}px`)
  e.style.animation = `pp-cycle ${opts.slow ? '2.4s' : '1s'} steps(4) infinite`
  e.style.animationPlayState = 'paused'
  playOnlyWhenVisible(e)
  return e
}

/**
 * A critter that slowly trots back and forth across a band of its container
 * (e.g. a chicken patrolling along a section's lower edge). Uses the walk strip.
 */
interface RoamOpts extends Omit<CritterOpts, 'css'> {
  bottom: string
  band: [number, number] // fractions of the container width
  speed: number // px/s
}
function roamStrip(parent: HTMLElement, key: keyof typeof STRIPS, opts: RoamOpts): HTMLElement {
  const s = STRIPS[key]
  const e = document.createElement('div')
  e.className = 'sx-critter'
  Object.assign(e.style, {
    position: 'absolute',
    left: '0',
    bottom: opts.bottom,
    width: `${s.fw * opts.scale}px`,
    height: `${s.fh * opts.scale}px`,
    backgroundImage: `url(${s.url})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${s.fw * s.frames * opts.scale}px ${s.fh * opts.scale}px`,
    imageRendering: 'pixelated',
    zIndex: String(opts.z ?? 2),
    willChange: 'transform',
  })
  if (opts.shadow !== false) e.style.filter = 'drop-shadow(0 3px 2px rgba(59, 46, 38, 0.26))'
  parent.appendChild(e)

  if (reduce) {
    e.style.backgroundPositionX = '0px'
    const w = parent.clientWidth || 600
    e.style.transform = `translateX(${Math.round(w * ((opts.band[0] + opts.band[1]) / 2))}px)`
    return e
  }
  e.style.setProperty('--pp-x1', `${-s.frames * s.fw * opts.scale}px`)
  e.style.animation = `pp-cycle ${(s.frames / s.fps).toFixed(2)}s steps(${s.frames}) infinite`
  e.style.animationPlayState = 'paused'

  let x = -1
  let dir: 1 | -1 = 1
  let last = 0
  let visible = false
  const io = new IntersectionObserver((ents) => { for (const en of ents) visible = en.isIntersecting }, { threshold: 0.12 })
  io.observe(e)

  const span = () => {
    const w = parent.clientWidth
    const min = Math.round(w * opts.band[0])
    const max = Math.max(min + 40, Math.round(w * opts.band[1]) - s.fw * opts.scale)
    return { min, max }
  }
  const step = (ts: number) => {
    if (!last) last = ts
    const dt = Math.min(64, ts - last)
    last = ts
    e.style.animationPlayState = visible ? 'running' : 'paused'
    const { min, max } = span()
    if (x < 0) x = min + (max - min) * 0.5
    if (visible) {
      x += dir * opts.speed * (dt / 1000)
      if (x >= max) { x = max; dir = -1 } else if (x <= min) { x = min; dir = 1 }
    }
    e.style.transform = `translateX(${x.toFixed(1)}px) scaleX(${dir === 1 ? -1 : 1})`
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
  return e
}

/** Make a section a positioning context so critters can be absolutely placed in it. */
function relative(sel: string): HTMLElement | null {
  const elx = document.querySelector<HTMLElement>(sel)
  if (elx && getComputedStyle(elx).position === 'static') elx.style.position = 'relative'
  return elx
}

/** Two little "z" glyphs drifting up over the sleeping cat. */
function addZzz(parent: HTMLElement, css: Partial<CSSStyleDeclaration>): void {
  if (reduce) return
  const wrap = document.createElement('div')
  wrap.className = 'pp-zzz'
  wrap.setAttribute('aria-hidden', 'true')
  Object.assign(wrap.style, { position: 'absolute', ...css })
  wrap.innerHTML = '<span>z</span><span>z</span>'
  parent.appendChild(wrap)
}

/**
 * Sprinkle ONE focal animal into each content section so the farm isn't all in the
 * hero — and so it calms as you scroll (busy hen up top, a sleeping cat at the night
 * CTA). Every critter pauses off-screen and has a reduced-motion static fallback.
 */
export function decorateSections(): void {
  // §2 companions — a hen pecking at the base, "the rest wait back at the farm"
  const meet = relative('.section--meet .wrap')
  if (meet) {
    mountStrip(meet, 'chickPeck', {
      scale: 3,
      z: 0,
      mobileHide: true, // clears the fineprint on narrow phones
      css: { right: 'clamp(8px, 4vw, 48px)', bottom: '8px' },
    })
  }

  // §3 a farm that grows — a placid cow watches the homestead (crops grow in front,
  // wired in market.ts/buildGrows). She faces right, toward the coop.
  const grows = document.getElementById('grows-art')
  if (grows) {
    mountStrip(grows, 'cowIdle', { scale: 3, z: 1, flip: true, css: { left: '4%', bottom: '9%' } })
  }

  // §4 the gentle loop — Biscuit the dog sits and watches the loop pay off
  const loop = relative('.section--biscuits .wrap')
  if (loop) {
    mountPet(loop, 'dog', {
      scale: 2,
      z: 0,
      mobileHide: true,
      css: { right: 'clamp(0px, 3vw, 40px)', bottom: '0' },
    })
  }

  // §5 seasons — a hen peeks out from behind the season cards (cards sit above her)
  const seasons = relative('.season-strip')
  if (seasons) {
    mountStrip(seasons, 'chickIdle', {
      scale: 3,
      z: 0,
      flip: true,
      css: { right: 'clamp(10px, 6%, 64px)', bottom: '-2px' },
    })
  }

  // §6 the market — a hen pecks on the stall floor, a nod to "Clucky (soon)"
  const market = relative('.market')
  if (market) {
    mountStrip(market, 'chickPeck', {
      scale: 3,
      z: 0, // behind the product cards (they're painted above a z:0 sibling)
      mobileHide: true,
      css: { left: '16px', bottom: '8px' },
    })
  }

  // §7 trust / final CTA — Pip the cat asleep as the farm's day ends (Zzz drifting up)
  const trust = relative('.section--trust .trust')
  if (trust) {
    mountPet(trust, 'cat', {
      scale: 2,
      z: 0,
      slow: true,
      mobileHide: true, // clears the centered fineprint at 320px
      css: { left: 'clamp(8px, 6vw, 72px)', bottom: '0' },
    })
    addZzz(trust, { left: `calc(clamp(8px, 6vw, 72px) + 64px)`, bottom: '56px' })
  }

  // footer — a hen stands on the picket-fence rail at the very bottom of the farm
  const footer = document.querySelector<HTMLElement>('.site-footer')
  if (footer) {
    if (getComputedStyle(footer).position === 'static') footer.style.position = 'relative'
    mountStrip(footer, 'chickIdle', {
      scale: 3,
      z: 1,
      flip: true,
      css: { right: '13%', top: '-19px' },
    })
  }
}

export { mountStrip, mountPet, roamStrip, relative }
