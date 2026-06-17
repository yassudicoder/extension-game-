// Hero interactivity + pixel-world assembly. Scenery is stamped from the local
// Sprout Lands tileset (see src/scene/tileset.ts); motion (parallax, the wandering
// pet, day/night) is preserved and gated on prefers-reduced-motion.
import { TILE, SCALE, type TileName, placeTile, cropTileURL } from './scene/tileset'

const FRAME = 96 // pet: 32px cell × 3
const WALK = { row: 1, frames: 6, fps: 9 }
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function setupDayNight(): void {
  const toggle = document.querySelector<HTMLButtonElement>('.daynight')
  if (!toggle) return
  const label = toggle.querySelector<HTMLElement>('.daynight__text')
  const apply = (time: 'day' | 'night') => {
    document.documentElement.dataset.time = time
    const night = time === 'night'
    toggle.setAttribute('aria-pressed', String(night))
    toggle.setAttribute('aria-label', night ? 'Wake the farm to daytime' : 'Light the lanterns for night')
    if (label) label.textContent = night ? 'Wake the farm' : 'Light the lanterns'
  }
  toggle.addEventListener('click', () =>
    apply(document.documentElement.dataset.time === 'night' ? 'day' : 'night'),
  )
}

async function buildWorld(): Promise<void> {
  const ground = document.querySelector<HTMLElement>('.ground')
  const bg = document.querySelector<HTMLElement>('.world__bg')
  const fg = document.querySelector<HTMLElement>('.world__fg')

  // seamless grass ground (crop the single fill tile, then CSS-repeat it)
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

  // --- the homestead: a complete coop building (single 3×3 sprite) ---
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

  // trees + bushes on the right (the sign covers the left half on wide screens)
  prop(bg, 'tree', { right: '34%', bottom: '31%' })
  prop(bg, 'tree', { right: '3%', bottom: '30%' })
  prop(bg, 'bush', { right: '28%', bottom: '32%' })
  prop(bg, 'flower', { right: '44%', bottom: '31%' })

  // --- a fence along the front ---
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
  if (!pet) return
  if (reduceMotion) {
    pet.style.animation = 'none'
    pet.style.backgroundPosition = '0 0'
    return
  }
  pet.style.backgroundPositionY = `${-WALK.row * FRAME}px`
  pet.style.setProperty('--pp-x1', `${-WALK.frames * FRAME}px`)
  pet.style.animation = `pp-cycle ${WALK.frames / WALK.fps}s steps(${WALK.frames}) infinite`

  const hero = pet.closest<HTMLElement>('.hero')
  let x = -1
  let dir: 1 | -1 = 1
  let last = 0
  const SPEED = 34
  const range = () => {
    const w = hero?.clientWidth ?? 800
    const min = Math.round(w * (w > 760 ? 0.46 : 0.08))
    const max = Math.max(min + 90, w - 150)
    return { min, max }
  }
  const step = (ts: number) => {
    if (!last) last = ts
    const dt = Math.min(64, ts - last)
    last = ts
    const { min, max } = range()
    if (x < 0) x = min
    x += dir * SPEED * (dt / 1000)
    if (x >= max) {
      x = max
      dir = -1
    } else if (x <= min) {
      x = min
      dir = 1
    }
    pet.style.transform = `translateX(${x.toFixed(1)}px) scaleX(${dir})`
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
  setupDayNight()
  void buildWorld()
  setupPet()
  setupParallax()
}
