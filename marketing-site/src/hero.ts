// Hero interactivity: day/night toggle, the wandering pixel pet (the product's
// CSS-steps technique), and gentle pointer parallax. All motion is gated on
// prefers-reduced-motion — reduced users get a calm, static daytime scene.

const FRAME = 96 // 32px sprite cell upscaled 3x for crisp pixels
const WALK = { row: 1, frames: 6, fps: 9 } // matches the extension sheet layout

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
  toggle.addEventListener('click', () => {
    apply(document.documentElement.dataset.time === 'night' ? 'day' : 'night')
  })
}

function setupPet(): void {
  const pet = document.querySelector<HTMLElement>('.pet')
  if (!pet) return

  if (reduceMotion) {
    // calm: a single static idle frame, no walking
    pet.style.animation = 'none'
    pet.style.backgroundPosition = '0 0'
    return
  }

  // walk cycle via CSS steps() (single shared keyframe `pp-cycle` in hero.css)
  pet.style.backgroundPositionY = `${-WALK.row * FRAME}px`
  pet.style.setProperty('--pp-x1', `${-WALK.frames * FRAME}px`)
  pet.style.animation = `pp-cycle ${WALK.frames / WALK.fps}s steps(${WALK.frames}) infinite`

  const hero = pet.closest<HTMLElement>('.hero')
  let x = -1 // sentinel: initialise to the left edge of the open field on first frame
  let dir: 1 | -1 = 1
  let last = 0
  const SPEED = 34 // px/s — an unhurried amble

  // Keep the cat in the OPEN field to the right of the sign so it's always visible
  // (the sign card sits over the left half on wide screens).
  const range = () => {
    const w = hero?.clientWidth ?? 800
    const min = Math.round(w * (w > 760 ? 0.47 : 0.1))
    const max = Math.max(min + 90, w - 140)
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
    const mx = ((e.clientX - r.left) / r.width) * 2 - 1 // -1..1
    const my = ((e.clientY - r.top) / r.height) * 2 - 1
    hero.style.setProperty('--mx', mx.toFixed(3))
    hero.style.setProperty('--my', my.toFixed(3))
  })
  hero.addEventListener('pointerleave', () => {
    hero.style.setProperty('--mx', '0')
    hero.style.setProperty('--my', '0')
  })
}

export function initHero(): void {
  setupDayNight()
  setupPet()
  setupParallax()
}
