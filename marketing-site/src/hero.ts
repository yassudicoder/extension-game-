// Hero interactivity + pixel-world assembly. Scenery is stamped from the local
// Sprout Lands tileset (see src/scene/tileset.ts). Motion (parallax, the wandering
// pets, day/night) is preserved and gated on prefers-reduced-motion.
//
// Signature touch: the animals NOTICE your cursor — come near one and it pauses,
// looks up, and faces you; click it and a little pixel heart floats up.
import { TILE, SCALE, type TileName, placeTile, cropTileURL } from './scene/tileset'
import { daypart } from './daypart'
import { type Pose, newPose, applyPose, makeDraggable } from './drag'
import dogUrl from './assets/sprites/dog.png'
import bunnyUrl from './assets/sprites/bunny.png'
// Animated farm livestock (single-row strips from the PixelFarmDEMO pack — same
// cozy palette as the Sprout Lands scenery, so the grid stays cohesive).
import cowWalkUrl from './assets/scene/PixelFarmDEMO/Animals/cow_walk.png'
import cowIdleUrl from './assets/scene/PixelFarmDEMO/Animals/cow_idle.png'
import chickWalkUrl from './assets/scene/PixelFarmDEMO/Animals/Chicken_B_walk.png'
import chickPeckUrl from './assets/scene/PixelFarmDEMO/Animals/Chicken_B_pecking.png'
// mature crop sprites for the hero's crop rows (last frame of the grow strips)
import cornGrowUrl from './assets/scene/PixelFarmDEMO/GrowthProcess/Corn_growth.png'
import lettuceGrowUrl from './assets/scene/PixelFarmDEMO/GrowthProcess/Lettuce_growth.png'

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

/**
 * A hero-level layer (above the sign + night tint) that a grabbed animal is
 * reparented into so it rides on top while held. It shares the hero's box exactly
 * (inset:0, like .scene/.world), so moving an animal between .world and here keeps
 * its left/bottom anchor — no positional jump. Pointer-transparent when idle.
 */
function holdLayer(hero: HTMLElement): HTMLElement {
  let h = hero.querySelector<HTMLElement>('.world__hold')
  if (!h) {
    h = document.createElement('div')
    h.className = 'world__hold'
    h.setAttribute('aria-hidden', 'true')
    hero.appendChild(h)
  }
  return h
}

/** A little puff of dust kicked up where an animal lands after a drop. */
function spawnDust(hero: HTMLElement, el: HTMLElement): void {
  if (reduceMotion) return
  const hr = hero.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const cx = r.left - hr.left + r.width / 2
  const cy = r.bottom - hr.top - 6
  for (let i = -1; i <= 1; i++) {
    const d = document.createElement('span')
    d.className = 'pp-dust'
    d.style.left = `${cx + i * 10}px`
    d.style.top = `${cy}px`
    d.style.setProperty('--dx', `${i * 16}px`)
    hero.appendChild(d)
    d.addEventListener('animationend', () => d.remove())
  }
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

/** Stamp a tile prop into a layer at an absolute position. */
function prop(parent: HTMLElement, name: TileName, css: Partial<CSSStyleDeclaration>, scale?: number): HTMLElement {
  const d = document.createElement('div')
  placeTile(d, name, scale)
  Object.assign(d.style, css)
  parent.appendChild(d)
  return d
}

/** A CSS-composed piece (windmill, pond, stall…) — kept in the Sprout Lands palette. */
function stamp(parent: HTMLElement, cls: string, css: Partial<CSSStyleDeclaration>, inner = ''): HTMLElement {
  const d = document.createElement('div')
  d.className = cls
  d.style.position = 'absolute'
  if (inner) d.innerHTML = inner
  Object.assign(d.style, css)
  parent.appendChild(d)
  return d
}

/** A wooden homestead building stacked from the Wooden-House roof/wall tiles. */
function composeBuilding(parent: HTMLElement, css: Partial<CSSStyleDeclaration>, scale: number): HTMLElement {
  const b = document.createElement('div')
  b.className = 'bld'
  Object.assign(b.style, css)
  for (const row of ['roofTop', 'roofMid', 'roofEave', 'wallMid', 'wallBot'] as TileName[]) {
    const r = document.createElement('div')
    placeTile(r, row, scale)
    b.appendChild(r)
  }
  const door = document.createElement('div')
  door.className = 'bld__door'
  placeTile(door, 'door', scale)
  b.appendChild(door)
  // a warm window beside the door, lit at night
  const glow = document.createElement('div')
  glow.className = 'bld__glow'
  const u = TILE * scale
  Object.assign(glow.style, {
    width: `${u * 0.5}px`,
    height: `${u * 0.4}px`,
    bottom: `${u * 0.7}px`,
    left: `${u * 0.42}px`,
  })
  b.appendChild(glow)
  parent.appendChild(b)
  return b
}

/** A mature crop sprite: the final frame of a grow strip, parked statically. */
function matureCrop(parent: HTMLElement, url: string, frames: number, cell: number, scale: number, css: Partial<CSSStyleDeclaration>): HTMLElement {
  const c = document.createElement('div')
  c.className = 'crop-row'
  Object.assign(c.style, {
    width: `${cell * scale}px`,
    height: `${cell * scale}px`,
    backgroundImage: `url(${url})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${cell * frames * scale}px ${cell * scale}px`,
    backgroundPositionX: `${-(frames - 1) * cell * scale}px`,
    ...css,
  })
  parent.appendChild(c)
  return c
}

async function buildWorld(): Promise<void> {
  const world = document.querySelector<HTMLElement>('.world')
  const ground = document.querySelector<HTMLElement>('.ground')
  const bg = document.querySelector<HTMLElement>('.world__bg')
  const fg = document.querySelector<HTMLElement>('.world__fg')
  if (!world || !bg || !fg) return

  if (ground) {
    try {
      const url = await cropTileURL('grass')
      ground.style.backgroundImage = `url(${url})`
      ground.style.backgroundSize = `${TILE * SCALE}px ${TILE * SCALE}px`
    } catch {
      /* sheet missing locally — ground stays empty, no broken asset */
    }
  }

  // Two extra parallax layers give the scene real depth: a far horizon (slowest)
  // and a mid field band between the buildings and the foreground fence.
  const far = document.createElement('div')
  far.className = 'world__far'
  far.setAttribute('aria-hidden', 'true')
  const mid = document.createElement('div')
  mid.className = 'world__mid'
  mid.setAttribute('aria-hidden', 'true')
  world.insertBefore(far, ground)
  world.insertBefore(mid, fg)

  // ---- FAR: a darkened treeline along the hills (rolling hills are CSS) ----
  for (let i = 0; i < 7; i++) {
    const t = prop(far, 'tree', { left: `${2 + i * 15}%`, bottom: '35%' }, 4)
    t.style.filter = 'brightness(0.82) saturate(0.85)'
  }

  // ---- BG: the homestead — barn, coop, windmill, pond, a market stall ----
  // The sign card holds the left, so the whole farm is composed in the right half.
  composeBuilding(bg, { right: '31%', bottom: '30%' }, 4) // the farmhouse/barn

  const coopEl = prop(bg, 'coop', { right: '10%', bottom: '31%' }, 4)
  coopEl.style.filter = 'drop-shadow(0 8px 6px rgba(59, 46, 38, 0.28))'
  const coopGlow = document.createElement('div')
  coopGlow.className = 'bld__glow'
  Object.assign(coopGlow.style, { width: '24px', height: '18px', top: '48%', left: '42%' })
  coopEl.appendChild(coopGlow)

  stamp(
    bg,
    'windmill',
    { right: '1%', bottom: '31%' },
    '<div class="windmill__post"></div><div class="windmill__blades"><i></i><i></i><i></i><i></i></div><div class="windmill__hub"></div>',
  )

  prop(bg, 'tree', { right: '42%', bottom: '31%' }) // fills the gap by the sign edge
  prop(bg, 'tree', { right: '21%', bottom: '33%' }, 5)

  stamp(bg, 'pond', { right: '16%', bottom: '14%' })
  prop(bg, 'bush', { right: '13%', bottom: '16%' }, 4) // reeds at the pond edge
  prop(bg, 'flower', { right: '25%', bottom: '16%' }, 3)

  stamp(
    bg,
    'stall',
    { right: '5%', bottom: '18%' },
    '<div class="stall__awning"></div><div class="stall__post stall__post--l"></div><div class="stall__post stall__post--r"></div><div class="stall__counter"></div>',
  )

  // ---- MID: crop rows, a scarecrow, and a hand-painted signpost ----
  matureCrop(mid, cornGrowUrl, 4, 16, 3, { right: '36%', bottom: '19%' })
  matureCrop(mid, cornGrowUrl, 4, 16, 3, { right: '32%', bottom: '19%' })
  matureCrop(mid, lettuceGrowUrl, 4, 16, 3, { right: '28%', bottom: '18%' })
  prop(mid, 'sunflower', { right: '24%', bottom: '19%' }, 3)
  prop(mid, 'pumpkin', { right: '40%', bottom: '17%' }, 3)

  stamp(
    mid,
    'scarecrow',
    { right: '30%', bottom: '20%' },
    '<div class="scarecrow__pole"></div><div class="scarecrow__cross"></div><div class="scarecrow__body"></div><div class="scarecrow__head"></div><div class="scarecrow__hat"></div>',
  )

  stamp(
    mid,
    'signpost',
    { right: '41%', bottom: '15%' },
    '<div class="signpost__pole"></div><div class="signpost__board">Pocket Farm<br>pop. 3 + you</div>',
  )

  // ---- FG: the picket fence + hanging lanterns ----
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

  // a string of lanterns across the top, dark by day and glowing at night
  for (const leftPct of [22, 46, 70, 88]) {
    stamp(fg, 'lantern', { left: `${leftPct}%`, top: '46px' }, '<div class="lantern__cord"></div><div class="lantern__body"></div>')
  }
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

  const pose: Pose = newPose()
  let dir: 1 | -1 = 1
  let last = 0
  let squashUntil = 0
  const range = () => {
    const w = hero.clientWidth
    const min = Math.round(w * (w > 760 ? cfg.bandMin : 0.06))
    const max = Math.max(min + 80, Math.round(w * (w > 760 ? cfg.bandMax : 0.92)) - 96)
    return { min, max }
  }

  pet.style.cursor = 'grab'
  pet.style.transformOrigin = '50% 100%'
  const world = pet.parentElement as HTMLElement
  const hold = holdLayer(hero)
  const drag = makeDraggable(pet, {
    pose,
    bandX: range,
    onGrab: () => {
      pet.style.filter = 'drop-shadow(0 16px 9px rgba(59, 46, 38, 0.34))'
      hold.appendChild(pet) // ride above the sign while carried
      applyMode('idle') // looks calm while carried
    },
    onResume: () => {
      world.appendChild(pet)
      pet.style.filter = '' // back to the CSS .pet shadow
      applyMode('walk')
    },
    onTap: () => {
      squashUntil = performance.now() + 170
      spawnHeart(hero, pet, false)
    },
    onLand: () => spawnDust(hero, pet),
  })

  const step = (ts: number) => {
    if (!last) last = ts
    const dt = Math.min(64, ts - last)
    last = ts
    const { min, max } = range()
    if (pose.x < 0) pose.x = min + (max - min) * cfg.start

    if (drag.phase === 'wander') {
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
        pose.x += dir * cfg.speed * (dt / 1000)
        if (pose.x >= max) {
          pose.x = max
          dir = -1
        } else if (pose.x <= min) {
          pose.x = min
          dir = 1
        }
      }
      pose.faceX = dir
      pose.y = 0
      pose.rot = 0
      let sy = 1
      if (ts < squashUntil) {
        const p = 1 - (squashUntil - ts) / 170
        sy = 1 - 0.12 * Math.sin(p * Math.PI)
      }
      pose.squashY = sy
    } else {
      drag.tick(ts, dt)
    }
    applyPose(pet, pose)
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
  const restFilter = el.style.filter

  const pose: Pose = newPose()
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

  el.style.cursor = 'grab'
  el.style.transformOrigin = '50% 100%'
  const world = el.parentElement as HTMLElement
  const hold = holdLayer(hero)
  const drag = makeDraggable(el, {
    pose,
    bandX: range,
    onGrab: () => {
      el.style.filter = 'drop-shadow(0 16px 9px rgba(59, 46, 38, 0.34))'
      hold.appendChild(el) // ride above the sign while carried
      setState('idle') // chews / settles while carried
    },
    onResume: () => {
      world.appendChild(el)
      el.style.filter = restFilter
      setState('walk')
      until = performance.now() + 1200 + Math.random() * 2000
    },
    onTap: () => {
      squashUntil = performance.now() + 170
      spawnHeart(hero, el, false)
    },
    onLand: () => spawnDust(hero, el),
  })

  const step = (ts: number) => {
    if (!last) {
      last = ts
      until = ts + 1400 + Math.random() * 2600 // walk a while before the first pause
    }
    const dt = Math.min(64, ts - last)
    last = ts
    const { min, max } = range()
    if (pose.x < 0) pose.x = min + (max - min) * cfg.start

    if (drag.phase === 'wander') {
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
          pose.x += dir * cfg.speed * (dt / 1000)
          if (pose.x >= max) {
            pose.x = max
            dir = -1
          } else if (pose.x <= min) {
            pose.x = min
            dir = 1
          }
        }
      }

      // strips face LEFT; flip to face right when heading/looking that way
      pose.faceX = dir === 1 ? -1 : 1
      pose.y = 0
      pose.rot = 0
      let sy = 1
      if (ts < squashUntil) {
        const p = 1 - (squashUntil - ts) / 170
        sy = 1 - 0.12 * Math.sin(p * Math.PI)
      }
      pose.squashY = sy
    } else {
      drag.tick(ts, dt)
    }
    applyPose(el, pose)
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
