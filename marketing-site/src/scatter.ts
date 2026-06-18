// Page-wide scattered companions — a few extra animals living in the margins and
// section seams, so the farm spills out of the hero across the whole page. They are
// the same draggable critters as the hero (pick one up and move it; drop it and it
// falls to whatever section's ground band it's over). Restraint over count: a handful,
// placed only in COPY-FREE safe zones (side gutters on wide screens, the padding seam
// at a section's base otherwise), never on headings, body, or controls.
//
// The whole layer is pointer-transparent (pointer-events:none); only the sprites
// themselves accept the pointer, so scrolling and clicks pass straight through.
import { type Pose, newPose, applyPose, makeDraggable, type Dragger } from './drag'
import catUrl from './assets/sprites/cat.png'
import dogUrl from './assets/sprites/dog.png'
import bunnyUrl from './assets/sprites/bunny.png'
import chickWalkUrl from './assets/scene/PixelFarmDEMO/Animals/Chicken_B_walk.png'
import chickPeckUrl from './assets/scene/PixelFarmDEMO/Animals/Chicken_B_pecking.png'

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Tiny seeded PRNG so each load varies but stays balanced (and is reproducible). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Species = 'cat' | 'dog' | 'bunny' | 'chick'
type Side = 'gutter-left' | 'gutter-right' | 'seam-left' | 'seam-right'

interface Placement {
  section: string
  side: Side
  species: Species
  scale: number
  onMobile: boolean // keep this one when the screen is narrow?
  jitter: number // 0..1, seeded vertical offset within the safe zone
}

// A curated, sparse set — quality over count. Gutter placements only appear when the
// screen is wide enough to have a clear gutter; otherwise they're skipped (so the page
// thins itself on mobile). Seam placements ride the padding gap at a section's base.
const PLACEMENTS: Placement[] = [
  { section: '#meet', side: 'gutter-right', species: 'chick', scale: 3, onMobile: false, jitter: 0.5 },
  { section: '#grows', side: 'gutter-left', species: 'bunny', scale: 2, onMobile: false, jitter: 0.6 },
  { section: '#biscuits', side: 'seam-left', species: 'chick', scale: 3, onMobile: true, jitter: 0 },
  { section: '#seasons', side: 'gutter-right', species: 'cat', scale: 2, onMobile: false, jitter: 0.45 },
  { section: '#market', side: 'seam-right', species: 'chick', scale: 3, onMobile: true, jitter: 0 },
  { section: '#trust', side: 'gutter-left', species: 'dog', scale: 2, onMobile: false, jitter: 0.5 },
]

const CHICK = {
  walk: { url: chickWalkUrl, fw: 10, fh: 11, frames: 4, fps: 9 },
  idle: { url: chickPeckUrl, fw: 10, fh: 10, frames: 2, fps: 5 },
}
const PET_URL: Record<string, string> = { cat: catUrl, dog: dogUrl, bunny: bunnyUrl }
const PET_CELL = 32

interface Critter {
  el: HTMLElement
  pose: Pose
  side: Side
  scale: number
  w: number
  h: number
  homeTop: number // document px of the band line (element top when grounded)
  rehome: () => void // recompute homeTop + band from the live layout
  band: { min: number; max: number }
  state: 'walk' | 'idle'
  dir: 1 | -1
  speed: number
  until: number
  squashUntil: number
  visible: boolean
  setSprite: (s: 'walk' | 'idle') => void
  faceFor: (dir: 1 | -1) => 1 | -1
  drag: Dragger | null
}

const critters: Critter[] = []
let field: HTMLElement | null = null

function makePet(species: Species, scale: number): { el: HTMLElement; w: number; h: number; setSprite: (s: 'walk' | 'idle') => void } {
  const el = document.createElement('div')
  el.className = 'sx2'
  const px = PET_CELL * scale
  Object.assign(el.style, {
    width: `${px}px`,
    height: `${px}px`,
    backgroundImage: `url(${PET_URL[species]})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${192 * scale}px ${160 * scale}px`,
    backgroundPosition: '0 0',
  })
  const setSprite = (s: 'walk' | 'idle') => {
    if (reduce) return
    if (s === 'idle') {
      el.style.backgroundPositionY = '0px'
      el.style.setProperty('--pp-x1', `${-4 * px}px`)
      el.style.animation = `pp-cycle 1.1s steps(4) infinite`
    } else {
      el.style.backgroundPositionY = `${-px}px`
      el.style.setProperty('--pp-x1', `${-6 * px}px`)
      el.style.animation = `pp-cycle ${6 / 8}s steps(6) infinite`
    }
  }
  return { el, w: px, h: px, setSprite }
}

function makeChick(scale: number): { el: HTMLElement; w: number; h: number; setSprite: (s: 'walk' | 'idle') => void } {
  const el = document.createElement('div')
  el.className = 'sx2'
  const apply = (strip: typeof CHICK.walk) => {
    el.style.width = `${strip.fw * scale}px`
    el.style.height = `${strip.fh * scale}px`
    el.style.backgroundImage = `url(${strip.url})`
    el.style.backgroundRepeat = 'no-repeat'
    el.style.backgroundSize = `${strip.fw * strip.frames * scale}px ${strip.fh * scale}px`
    if (reduce) {
      el.style.backgroundPositionX = '0px'
      el.style.animation = 'none'
      return
    }
    el.style.setProperty('--pp-x1', `${-strip.frames * strip.fw * scale}px`)
    el.style.animation = `pp-cycle ${(strip.frames / strip.fps).toFixed(2)}s steps(${strip.frames}) infinite`
  }
  apply(CHICK.walk)
  return { el, w: CHICK.walk.fw * scale, h: CHICK.walk.fh * scale, setSprite: (s) => apply(s === 'walk' ? CHICK.walk : CHICK.idle) }
}

function docHeight(): number {
  const b = document.body
  const e = document.documentElement
  return Math.max(b.scrollHeight, e.scrollHeight, b.offsetHeight, e.offsetHeight)
}

function gutterWidth(): number {
  const wrap = document.querySelector<HTMLElement>('.wrap')
  if (!wrap) return 0
  return Math.max(0, (window.innerWidth - wrap.clientWidth) / 2)
}

/** The translateX band (relative to left:0) a critter roams. null → no safe zone. */
function bandFor(side: Side, w: number): { min: number; max: number } | null {
  const vw = window.innerWidth
  const g = gutterWidth()
  const pad = 8
  if (side === 'gutter-left') {
    if (g < w + 12) return null
    return { min: pad, max: g - w - pad }
  }
  if (side === 'gutter-right') {
    if (g < w + 12) return null
    return { min: vw - g + pad, max: vw - w - pad }
  }
  const edge = Math.max(16, g * 0.4)
  if (side === 'seam-left') return { min: edge, max: Math.max(edge + 40, vw * 0.4 - w) }
  return { min: Math.min(vw * 0.6, vw - w - edge - 80), max: vw - w - edge }
}

function seamOffset(s: HTMLElement): number {
  return s.classList.contains('site-footer') ? 26 : 14
}

/** Document px of the ground-band line for a section under a viewport point. */
function sectionGroundTopAt(clientX: number, clientY: number, h: number): number | null {
  const zones = [...document.querySelectorAll<HTMLElement>('main section, .site-footer')]
  for (const s of zones) {
    const r = s.getBoundingClientRect()
    if (clientY >= r.top && clientY <= r.bottom && clientX >= r.left && clientX <= r.right) {
      return r.bottom + window.scrollY - h - seamOffset(s)
    }
  }
  return null
}

function makeCritter(p: Placement, rand: () => number): Critter | null {
  const host = document.querySelector<HTMLElement>(p.section)
  if (!host) return null
  if (window.innerWidth < 700 && !p.onMobile) return null // thin out on phones
  const built = p.species === 'chick' ? makeChick(p.scale) : makePet(p.species, p.scale)
  if (!bandFor(p.side, built.w)) return null // no safe zone on this screen → skip

  const seam = p.side.startsWith('seam')
  const el = built.el
  Object.assign(el.style, { position: 'absolute', left: '0', zIndex: '2', cursor: 'grab', transformOrigin: '50% 100%' })
  el.setAttribute('aria-hidden', 'true')
  const restFilter = 'drop-shadow(0 3px 2px rgba(59, 46, 38, 0.26))'
  el.style.filter = restFilter
  field!.appendChild(el)

  const pose = newPose()
  const faceFor = (dir: 1 | -1): 1 | -1 => (p.species === 'chick' ? (dir === 1 ? -1 : 1) : dir)

  const c: Critter = {
    el,
    pose,
    side: p.side,
    scale: p.scale,
    w: built.w,
    h: built.h,
    homeTop: 0,
    band: { min: 0, max: 0 },
    rehome: () => {},
    state: 'walk',
    dir: rand() < 0.5 ? 1 : -1,
    speed: p.species === 'chick' ? 16 + rand() * 10 : 24 + rand() * 14,
    until: 0,
    squashUntil: 0,
    visible: false,
    setSprite: built.setSprite,
    faceFor,
    drag: null,
  }

  c.rehome = () => {
    const r = host.getBoundingClientRect()
    c.homeTop = seam
      ? r.bottom + window.scrollY - c.h - seamOffset(host)
      : r.top + window.scrollY + r.height * (0.42 + p.jitter * 0.32)
    el.style.top = `${Math.round(c.homeTop)}px`
    const b = bandFor(c.side, c.w)
    if (b) c.band = b
  }
  c.rehome()
  pose.x = c.band.min + (c.band.max - c.band.min) * rand()

  if (reduce) {
    built.setSprite('idle')
    pose.faceX = faceFor(c.dir)
    applyPose(el, pose)
    critters.push(c)
    return c
  }

  c.drag = makeDraggable(el, {
    pose,
    bandX: () => c.band,
    groundY: () => {
      // derive the drop point from the live pose (the field sits at viewport x:0)
      const centerX = c.pose.x + c.w / 2
      const feetY = c.homeTop + c.pose.y + c.h - window.scrollY
      const target = sectionGroundTopAt(centerX, feetY, c.h)
      return target == null ? 0 : target - c.homeTop // land on the section under the drop
    },
    onGrab: () => {
      el.style.zIndex = '40'
      el.style.filter = 'drop-shadow(0 14px 8px rgba(59, 46, 38, 0.32))'
      c.setSprite('idle')
    },
    onResume: () => {
      el.style.zIndex = '2'
      el.style.filter = restFilter
      c.setSprite('walk')
      c.until = performance.now() + 900 + rand() * 1800
    },
    onTap: () => {
      c.squashUntil = performance.now() + 170
    },
  })
  built.setSprite('walk')
  critters.push(c)
  return c
}

let last = 0
function step(ts: number): void {
  if (!last) last = ts
  const dt = Math.min(64, ts - last)
  last = ts
  for (const c of critters) {
    const phase = c.drag?.phase ?? 'wander'
    if (!c.visible && phase === 'wander') {
      c.el.style.animationPlayState = 'paused'
      continue
    }
    c.el.style.animationPlayState = 'running'
    if (phase === 'wander') {
      const { min, max } = c.band
      if (ts >= c.until) {
        if (c.state === 'walk') {
          c.state = 'idle'
          c.setSprite('idle')
          c.until = ts + 1100 + Math.random() * 2600
        } else {
          c.state = 'walk'
          c.setSprite('walk')
          if (Math.random() < 0.5) c.dir = (c.dir * -1) as 1 | -1
          c.until = ts + 1600 + Math.random() * 3000
        }
      }
      if (c.state === 'walk') {
        c.pose.x += c.dir * c.speed * (dt / 1000)
        if (c.pose.x >= max) {
          c.pose.x = max
          c.dir = -1
        } else if (c.pose.x <= min) {
          c.pose.x = min
          c.dir = 1
        }
      }
      c.pose.faceX = c.faceFor(c.dir)
      c.pose.y = 0
      c.pose.rot = 0
      let sy = 1
      if (ts < c.squashUntil) {
        const pr = 1 - (c.squashUntil - ts) / 170
        sy = 1 - 0.12 * Math.sin(pr * Math.PI)
      }
      c.pose.squashY = sy
    } else {
      c.drag!.tick(ts, dt)
    }
    applyPose(c.el, c.pose)
  }
  requestAnimationFrame(step)
}

let resizeRAF = 0
export function scatterAnimals(): void {
  const main = document.getElementById('main')
  if (!main) return
  field = document.createElement('div')
  field.className = 'critter-field'
  field.setAttribute('aria-hidden', 'true')
  document.body.appendChild(field)

  const syncHeight = () => {
    if (field) field.style.height = `${docHeight()}px`
  }
  syncHeight()

  const rand = mulberry32((Math.random() * 1e9) | 0)
  for (const p of PLACEMENTS) makeCritter(p, rand)
  if (!critters.length) return

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const c = critters.find((x) => x.el === en.target)
          if (c) c.visible = en.isIntersecting
        }
      },
      { rootMargin: '80px' },
    )
    critters.forEach((c) => io.observe(c.el))
  } else {
    critters.forEach((c) => (c.visible = true))
  }

  // recompute the field height + each critter's home band when the layout changes
  const relayout = () => {
    cancelAnimationFrame(resizeRAF)
    resizeRAF = requestAnimationFrame(() => {
      syncHeight()
      for (const c of critters) {
        if (!c.drag || c.drag.phase === 'wander') c.rehome()
      }
    })
  }
  window.addEventListener('resize', relayout, { passive: true })
  window.addEventListener('load', relayout)

  if (!reduce) requestAnimationFrame(step)
}
