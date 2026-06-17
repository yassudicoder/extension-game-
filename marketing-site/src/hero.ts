// Hero interactivity + pixel-world assembly. Scenery is stamped from the local
// Sprout Lands tileset (see src/scene/tileset.ts). Motion (parallax, the wandering
// pets, day/night) is preserved and gated on prefers-reduced-motion.
//
// Signature touch: the animals NOTICE your cursor — come near one and it pauses,
// looks up, and faces you; click it and a little pixel heart floats up.
import { TILE, SCALE, type TileName, placeTile, cropTileURL } from './scene/tileset'
import { daypart } from './daypart'
import dogUrl from './assets/sprites/dog.png'
import bunnyUrl from './assets/sprites/bunny.png'
// Animated farm livestock (single-row strips from the PixelFarmDEMO pack — same
// cozy palette as the Sprout Lands scenery, so the grid stays cohesive).
import cowWalkUrl from './assets/scene/PixelFarmDEMO/Animals/cow_walk.png'
import cowIdleUrl from './assets/scene/PixelFarmDEMO/Animals/cow_idle.png'
import chickWalkUrl from './assets/scene/PixelFarmDEMO/Animals/Chicken_B_walk.png'
import chickPeckUrl from './assets/scene/PixelFarmDEMO/Animals/Chicken_B_pecking.png'

const FRAME = 96 // pet: 32px cell × 3
const WALK = { row: 1, frames: 6, fps: 9 }
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const pointer = { x: 0, y: 0, inside: false }

// ---- animated livestock: horizontal sprite strips, all facing left at rest ----
interface Strip {
  url: string
  fw: number // frame width (px, native)
  fh: number // frame height
  frames: number
  fps: number
}
const COW_WALK: Strip = { url: cowWalkUrl, fw: 26, fh: 22, frames: 5, fps: 7 }
const COW_IDLE: Strip = { url: cowIdleUrl, fw: 25, fh: 22, frames: 5, fps: 3 }
const CHICK_WALK: Strip = { url: chickWalkUrl, fw: 10, fh: 11, frames: 4, fps: 9 }
const CHICK_PECK: Strip = { url: chickPeckUrl, fw: 10, fh: 10, frames: 2, fps: 5 }

let lastHeart = 0
function spawnHeart(hero: HTMLElement, pet: HTMLElement, calm: boolean): void {
  const now = performance.now()
  if (now - lastHeart < 300) return
  lastHeart = now
  const hr = hero.getBoundingClientRect()
  const pr = pet.getBoundingClientRect()
  const heart = document.createElement('span')
  heart.className = 'pp-heart' + (calm ? ' pp-heart--calm' : '')
  heart.style.left = `${pr.left - hr.left + pr.width / 2}px`
  heart.style.top = `${pr.top - hr.top + pr.height * 0.2}px`
  hero.appendChild(heart)
  heart.addEventListener('animationend', () => heart.remove())
}

function setupDayNight(initial: 'day' | 'night'): void {
  const toggle = document.querySelector<HTMLButtonElement>('.daynight')
  const label = toggle?.querySelector<HTMLElement>('.daynight__text')
  const apply = (time: 'day' | 'night') => {
    document.documentElement.dataset.time = time
    const night = time === 'night'
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(night))
      toggle.setAttribute('aria-label', night ? 'Wake the farm to daytime' : 'Light the lanterns for night')
    }
    if (label) label.textContent = night ? 'Wake the farm' : 'Light the lanterns'
  }
  apply(initial)
  toggle?.addEventListener('click', () =>
    apply(document.documentElement.dataset.time === 'night' ? 'day' : 'night'),
  )
}

function setupGreeting(text: string): void {
  const g = document.getElementById('sign-greeting')
  if (g) g.textContent = text
}

async function buildWorld(): Promise<void> {
  const ground = document.querySelector<HTMLElement>('.ground')
  const bg = document.querySelector<HTMLElement>('.world__bg')
  const fg = document.querySelector<HTMLElement>('.world__fg')

  if (ground) {
    try {
      const url = await cropTileURL('grass')
      ground.style.backgroundImage = `url(${url})`
      ground.style.backgroundSize = `${TILE * SCALE}px ${TILE * SCALE}px`
    } catch {
      /* sheet missing locally — ground stays empty, no broken asset */
    }
  }
  if (!bg || !fg) return

  const prop = (parent: HTMLElement, name: TileName, css: Partial<CSSStyleDeclaration>, scale?: number) => {
    const d = document.createElement('div')
    placeTile(d, name, scale)
    Object.assign(d.style, css)
    parent.appendChild(d)
    return d
  }

  const coopEl = prop(bg, 'coop', { right: '11%', bottom: '32%' })
  coopEl.style.filter = 'drop-shadow(0 8px 6px rgba(59, 46, 38, 0.28))'
  const glow = document.createElement('div')
  glow.className = 'house__glow'
  Object.assign(glow.style, {
    position: 'absolute',
    width: '44px',
    height: '34px',
    top: '40%',
    left: '50%',
    transform: 'translateX(-50%)',
  })
  coopEl.appendChild(glow)

  prop(bg, 'tree', { right: '34%', bottom: '31%' })
  prop(bg, 'tree', { right: '2%', bottom: '30%' })
  prop(bg, 'bush', { right: '28%', bottom: '32%' })
  prop(bg, 'flower', { right: '44%', bottom: '31%' })
  // (live, animated chickens + a grazing cow are spawned in setupCritters)

  const fence = document.createElement('div')
  Object.assign(fence.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    bottom: '13%',
    display: 'flex',
    alignItems: 'flex-end',
  })
  const seg = TILE * SCALE
  const n = Math.ceil((window.innerWidth + seg) / seg)
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div')
    placeTile(s, i === 0 ? 'fenceL' : i === n - 1 ? 'fenceR' : 'fenceMid')
    fence.appendChild(s)
  }
  fg.appendChild(fence)
}

function makePetEl(world: HTMLElement, sheetUrl: string, bottomPct: string): HTMLElement {
  const e = document.createElement('div')
  e.className = 'pet pet--extra'
  e.style.backgroundImage = `url(${sheetUrl})`
  e.style.bottom = bottomPct
  world.appendChild(e)
  return e
}

interface PetCfg {
  bandMin: number
  bandMax: number
  speed: number
  start: number // 0..1 starting point within the band, so the herd spreads on load
}
function petController(pet: HTMLElement, hero: HTMLElement, cfg: PetCfg): void {
  let mode: 'walk' | 'idle' = 'walk'
  const applyMode = (m: 'walk' | 'idle') => {
    if (m === mode) return
    mode = m
    if (m === 'idle') {
      pet.style.backgroundPositionY = '0px'
      pet.style.setProperty('--pp-x1', `${-4 * FRAME}px`)
      pet.style.animation = 'pp-cycle 1.1s steps(4) infinite'
    } else {
      pet.style.backgroundPositionY = `${-WALK.row * FRAME}px`
      pet.style.setProperty('--pp-x1', `${-WALK.frames * FRAME}px`)
      pet.style.animation = `pp-cycle ${WALK.frames / WALK.fps}s steps(${WALK.frames}) infinite`
    }
  }
  applyMode('walk')

  let x = -1
  let dir: 1 | -1 = 1
  let last = 0
  let squashUntil = 0
  const range = () => {
    const w = hero.clientWidth
    const min = Math.round(w * (w > 760 ? cfg.bandMin : 0.06))
    const max = Math.max(min + 80, Math.round(w * (w > 760 ? cfg.bandMax : 0.92)) - 96)
    return { min, max }
  }

  pet.style.cursor = 'pointer'
  pet.addEventListener('click', () => {
    squashUntil = performance.now() + 170
    spawnHeart(hero, pet, false)
  })

  const step = (ts: number) => {
    if (!last) last = ts
    const dt = Math.min(64, ts - last)
    last = ts
    const { min, max } = range()
    if (x < 0) x = min + (max - min) * cfg.start

    let noticing = false
    let ndir: 1 | -1 = dir
    if (pointer.inside) {
      const r = pet.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (Math.abs(pointer.x - cx) < 140 && Math.abs(pointer.y - cy) < 95) {
        noticing = true
        ndir = pointer.x >= cx ? 1 : -1
      }
    }
    if (noticing) {
      applyMode('idle')
      dir = ndir
    } else {
      applyMode('walk')
      x += dir * cfg.speed * (dt / 1000)
      if (x >= max) {
        x = max
        dir = -1
      } else if (x <= min) {
        x = min
        dir = 1
      }
    }
    let sy = 1
    if (ts < squashUntil) {
      const p = 1 - (squashUntil - ts) / 170
      sy = 1 - 0.12 * Math.sin(p * Math.PI)
    }
    pet.style.transform = `translateX(${x.toFixed(1)}px) scaleX(${dir}) scaleY(${sy.toFixed(3)})`
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function setupPets(): void {
  const hero = document.querySelector<HTMLElement>('.hero')
  const world = document.querySelector<HTMLElement>('.world')
  const cat = document.querySelector<HTMLElement>('.pet')
  if (!hero || !world || !cat) return

  const dog = makePetEl(world, dogUrl, '15%')
  const bunny = makePetEl(world, bunnyUrl, '21%')
  const all = [cat, dog, bunny]

  if (reduceMotion) {
    const w = hero.clientWidth
    const frac = [0.5, 0.66, 0.8]
    all.forEach((p, i) => {
      p.style.animation = 'none'
      p.style.backgroundPosition = '0 0'
      p.style.transform = `translateX(${Math.round(w * frac[i])}px)`
      p.style.cursor = 'pointer'
      p.addEventListener('click', () => spawnHeart(hero, p, true))
    })
    return
  }

  hero.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
    pointer.inside = true
  })
  hero.addEventListener('pointerleave', () => {
    pointer.inside = false
  })

  petController(cat, hero, { bandMin: 0.46, bandMax: 0.9, speed: 33, start: 0.15 })
  petController(dog, hero, { bandMin: 0.5, bandMax: 0.86, speed: 45, start: 0.7 })
  petController(bunny, hero, { bandMin: 0.55, bandMax: 0.92, speed: 26, start: 0.42 })
}

/* ===== animated livestock: a grazing cow + a flock of pecking chickens ===== */
function applyStrip(el: HTMLElement, s: Strip, scale: number): void {
  el.style.backgroundImage = `url(${s.url})`
  el.style.backgroundSize = `${s.fw * s.frames * scale}px ${s.fh * scale}px`
  el.style.width = `${s.fw * scale}px`
  el.style.height = `${s.fh * scale}px`
  el.style.setProperty('--pp-x1', `${-s.frames * s.fw * scale}px`)
  el.style.animation = `pp-cycle ${(s.frames / s.fps).toFixed(2)}s steps(${s.frames}) infinite`
}

interface CritterCfg {
  walk: Strip
  idle: Strip // chickens peck, the cow chews — used as the "resting" loop
  scale: number
  bandMin: number
  bandMax: number
  speed: number // px/s
  start: number
  bottom: string
  z: number
  notice: boolean // the cow looks up and faces your cursor; chickens stay busy
  clearSign?: boolean // keep big animals out from behind the hero signboard
}

const signEl = document.querySelector<HTMLElement>('.sign')

function critterController(el: HTMLElement, hero: HTMLElement, cfg: CritterCfg): void {
  let state: 'walk' | 'idle' = 'walk'
  applyStrip(el, cfg.walk, cfg.scale)

  let x = -1
  let dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
  let last = 0
  let until = 0
  let squashUntil = 0

  const range = () => {
    const w = hero.clientWidth
    const narrow = w <= 760
    const span = el.offsetWidth || cfg.walk.fw * cfg.scale
    let min = Math.round(w * (narrow ? 0.04 : cfg.bandMin))
    // on wide screens the signboard occupies the left — keep big animals to its right
    if (cfg.clearSign && !narrow && signEl) {
      min = Math.max(min, Math.round(signEl.getBoundingClientRect().right) + 14)
    }
    const max = Math.max(min + 50, Math.round(w * (narrow ? 0.92 : cfg.bandMax)) - span)
    return { min, max }
  }
  const setState = (s: 'walk' | 'idle') => {
    if (s === state) return
    state = s
    applyStrip(el, s === 'walk' ? cfg.walk : cfg.idle, cfg.scale)
  }

  el.style.cursor = 'pointer'
  el.addEventListener('click', () => {
    squashUntil = performance.now() + 170
    spawnHeart(hero, el, false)
  })

  const step = (ts: number) => {
    if (!last) {
      last = ts
      until = ts + 1400 + Math.random() * 2600 // walk a while before the first pause
    }
    const dt = Math.min(64, ts - last)
    last = ts
    const { min, max } = range()
    if (x < 0) x = min + (max - min) * cfg.start

    let noticing = false
    if (cfg.notice && pointer.inside) {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (Math.abs(pointer.x - cx) < 160 && Math.abs(pointer.y - cy) < 120) {
        noticing = true
        dir = pointer.x >= cx ? 1 : -1
        setState('idle')
      }
    }

    if (!noticing) {
      if (ts >= until) {
        if (state === 'walk') {
          setState('idle')
          until = ts + 800 + Math.random() * 2400 // pause to graze / peck
        } else {
          setState('walk')
          if (Math.random() < 0.4) dir = (dir * -1) as 1 | -1
          until = ts + 1600 + Math.random() * 3200
        }
      }
      if (state === 'walk') {
        x += dir * cfg.speed * (dt / 1000)
        if (x >= max) {
          x = max
          dir = -1
        } else if (x <= min) {
          x = min
          dir = 1
        }
      }
    }

    let sy = 1
    if (ts < squashUntil) {
      const p = 1 - (squashUntil - ts) / 170
      sy = 1 - 0.12 * Math.sin(p * Math.PI)
    }
    // strips face LEFT; flip to face right when heading/looking that way
    const face = dir === 1 ? -1 : 1
    el.style.transform = `translateX(${x.toFixed(1)}px) scaleX(${face}) scaleY(${sy.toFixed(3)})`
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function setupCritters(): void {
  const hero = document.querySelector<HTMLElement>('.hero')
  const world = document.querySelector<HTMLElement>('.world')
  if (!hero || !world) return

  const make = (cfg: CritterCfg) => {
    const el = document.createElement('div')
    el.className = 'critter'
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      bottom: cfg.bottom,
      zIndex: String(cfg.z),
      imageRendering: 'pixelated',
      backgroundRepeat: 'no-repeat',
      willChange: 'transform',
      filter: 'drop-shadow(0 4px 2px rgba(59, 46, 38, 0.28))',
    })
    world.appendChild(el)
    return el
  }

  const cow: CritterCfg = {
    walk: COW_WALK, idle: COW_IDLE, scale: 4,
    bandMin: 0.5, bandMax: 0.82, speed: 15, start: 0.4, bottom: '20%', z: 2, notice: true, clearSign: true,
  }
  const chicks: CritterCfg[] = [
    { walk: CHICK_WALK, idle: CHICK_PECK, scale: 3, bandMin: 0.56, bandMax: 0.82, speed: 23, start: 0.2, bottom: '15%', z: 4, notice: false },
    { walk: CHICK_WALK, idle: CHICK_PECK, scale: 3, bandMin: 0.6, bandMax: 0.9, speed: 19, start: 0.65, bottom: '12%', z: 4, notice: false },
    { walk: CHICK_WALK, idle: CHICK_PECK, scale: 3, bandMin: 0.5, bandMax: 0.8, speed: 26, start: 0.88, bottom: '17%', z: 4, notice: false },
  ]
  const cfgs = [cow, ...chicks]

  if (reduceMotion) {
    const w = hero.clientWidth
    cfgs.forEach((cfg) => {
      const el = make(cfg)
      applyStrip(el, cfg.idle, cfg.scale)
      el.style.animation = 'none'
      el.style.backgroundPositionX = '0px'
      el.style.transform = `translateX(${Math.round(w * ((cfg.bandMin + cfg.bandMax) / 2))}px)`
      el.style.cursor = 'pointer'
      el.addEventListener('click', () => spawnHeart(hero, el, true))
    })
    return
  }
  cfgs.forEach((cfg) => critterController(make(cfg), hero, cfg))
}

/* a pinch of magic: butterflies drift by day, fireflies glow at night (CSS-driven) */
function setupAmbient(): void {
  if (reduceMotion) return
  const scene = document.querySelector<HTMLElement>('.scene')
  if (!scene) return
  const layer = document.createElement('div')
  layer.className = 'ambient'
  layer.setAttribute('aria-hidden', 'true')
  const spots = [
    { x: 18, y: 54, d: 0 }, { x: 33, y: 42, d: 2.4 }, { x: 49, y: 60, d: 1.1 },
    { x: 64, y: 47, d: 3.2 }, { x: 78, y: 58, d: 0.7 }, { x: 88, y: 40, d: 2.0 },
  ]
  spots.forEach((s) => {
    const m = document.createElement('span')
    m.className = 'mote'
    m.style.left = `${s.x}%`
    m.style.top = `${s.y}%`
    m.style.animationDelay = `${s.d}s`
    layer.appendChild(m)
  })
  scene.appendChild(layer)
}

function setupParallax(): void {
  if (reduceMotion) return
  const hero = document.querySelector<HTMLElement>('.hero')
  if (!hero) return
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect()
    hero.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3))
  })
  hero.addEventListener('pointerleave', () => hero.style.setProperty('--mx', '0'))
}

export function initHero(): void {
  const dp = daypart()
  setupDayNight(dp.time)
  setupGreeting(dp.greeting)
  void buildWorld()
  setupPets()
  setupCritters()
  setupAmbient()
  setupParallax()
}
