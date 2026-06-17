// Hero interactivity + pixel-world assembly. Scenery is stamped from the local
// Sprout Lands tileset (see src/scene/tileset.ts). Motion (parallax, the wandering
// pet, day/night) is preserved and gated on prefers-reduced-motion.
//
// Signature touch: the cat NOTICES your cursor — when the pointer comes near it
// pauses, looks up, and faces you; click it and a little pixel heart floats up.
import { TILE, SCALE, type TileName, placeTile, cropTileURL } from './scene/tileset'
import { daypart } from './daypart'

const FRAME = 96 // pet: 32px cell × 3
const WALK = { row: 1, frames: 6, fps: 9 }
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

let lastHeart = 0
/** Float a pixel heart up from the pet (calm = opacity-only, for reduced motion). */
function spawnHeart(hero: HTMLElement, pet: HTMLElement, calm: boolean): void {
  const now = performance.now()
  if (now - lastHeart < 380) return // gentle: never confetti-spam
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
  apply(initial) // arrive in the world that matches the visitor's real clock
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

  const prop = (parent: HTMLElement, name: TileName, css: Partial<CSSStyleDeclaration>) => {
    const d = document.createElement('div')
    placeTile(d, name)
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
  prop(bg, 'tree', { right: '3%', bottom: '30%' })
  prop(bg, 'bush', { right: '28%', bottom: '32%' })
  prop(bg, 'flower', { right: '44%', bottom: '31%' })

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

function setupPet(): void {
  const pet = document.querySelector<HTMLElement>('.pet')
  const hero = document.querySelector<HTMLElement>('.hero')
  if (!pet || !hero) return

  if (reduceMotion) {
    pet.style.animation = 'none'
    pet.style.backgroundPosition = '0 0'
    pet.style.cursor = 'pointer'
    pet.addEventListener('click', () => spawnHeart(hero, pet, true)) // gentle, opacity-only
    return
  }

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
  let noticing = false
  let noticeDir: 1 | -1 = 1
  const SPEED = 34
  const range = () => {
    const w = hero.clientWidth
    const min = Math.round(w * (w > 760 ? 0.46 : 0.08))
    return { min, max: Math.max(min + 90, w - 150) }
  }

  hero.addEventListener('pointermove', (e) => {
    const r = pet.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    noticing = Math.abs(e.clientX - cx) < 150 && Math.abs(e.clientY - cy) < 100
    noticeDir = e.clientX >= cx ? 1 : -1
  })
  hero.addEventListener('pointerleave', () => {
    noticing = false
  })
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
    if (x < 0) x = min
    if (noticing) {
      applyMode('idle')
      dir = noticeDir
    } else {
      applyMode('walk')
      x += dir * SPEED * (dt / 1000)
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
  setupPet()
  setupParallax()
}
