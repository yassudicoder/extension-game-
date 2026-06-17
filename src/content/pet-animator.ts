import type { Animal } from '../shared/types'
import { type AnimState, SPRITES, mountSprite, setSpriteState, setStaticFrame } from '../shared/sprites'

// Drives the on-page pixel pet. Frame-cycling is CSS steps() (see setSpriteState);
// world behaviour is a rAF loop that wanders, runs, jumps, and pounces so the pet
// feels alive rather than pacing two steps. The loop pauses when the tab is hidden
// and is skipped under reduced motion. There is no sad/sick state — idle is the
// floor, so the pet always stays forgiving.

const SCALE = 2 // 32px frame -> 64px on screen
const PET_W = 32 * SCALE // 64px — keep in sync with mountSprite / styles.ts
const MARGIN = 8 // stay this far from the opposite viewport edge
const RANGE = 70 // max px of INWARD roaming from the anchored edge
const WALK_SPD = 17 // px/s
const RUN_SPD = 52 // px/s
const JUMP_MS = 520
const JUMP_H = 24 // px peak hop height

type Action = 'idle' | 'walk' | 'run' | 'jump'

export interface Animator {
  start(): void
  stop(): void
  setSleeping(sleeping: boolean): void
  remount(): void
  celebrate(): void
  drink(): void
  eat(): void
  nudge(): void
  dispose(): void
}

export function createAnimator(
  petEl: HTMLElement,
  spriteEl: HTMLElement,
  fxEl: HTMLElement,
  getAnimal: () => Animal,
): Animator {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let raf = 0
  let running = false
  let sleeping = false
  let displayed: AnimState | null = null

  let oneShotState: AnimState | null = null
  let oneShotUntil = 0

  let action: Action = 'idle'
  let posX = 0
  let yOff = 0
  let dir = 1
  let targetX = 0
  let decideAt = 0
  let lastTs = 0

  // jump bookkeeping
  let jumpStart = 0
  let jumpFromX = 0
  let jumpToX = 0

  mountSprite(spriteEl, getAnimal(), SCALE)

  // The pet roams INWARD from whichever horizontal edge it's anchored to, so it can
  // never walk off-screen. We read the anchored side from petEl's inline style
  // (pet-overlay sets `right` OR `left`) and clamp the span to the room actually
  // available in the current viewport (so it's safe on small windows too).
  function roamBounds(): { lo: number; hi: number } {
    const rightAnchored = petEl.style.right !== '' && petEl.style.right !== 'auto'
    const dxStr = rightAnchored ? petEl.style.right : petEl.style.left
    const dx = Math.max(0, parseFloat(dxStr) || 0)
    const avail = Math.max(0, window.innerWidth - PET_W - MARGIN - dx)
    const span = Math.min(RANGE, avail)
    // right-anchored -> roam leftward (negative); left-anchored -> rightward (positive)
    return rightAnchored ? { lo: -span, hi: 0 } : { lo: 0, hi: span }
  }
  const clampTo = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
  const pickTarget = (lo: number, hi: number) => lo + Math.random() * (hi - lo)

  function apply(state: AnimState): void {
    if (state === displayed) return
    displayed = state
    if (prefersReduced) {
      setStaticFrame(spriteEl, getAnimal(), state === 'sleep' ? 'sleep' : 'idle', 0, SCALE)
    } else {
      setSpriteState(spriteEl, getAnimal(), state, SCALE)
    }
  }

  function render(): void {
    petEl.style.transform = `translate(${posX.toFixed(1)}px, ${yOff.toFixed(1)}px) scaleX(${dir})`
  }

  function startJump(ts: number, lo: number, hi: number): void {
    action = 'jump'
    jumpStart = ts
    jumpFromX = posX
    jumpToX = clampTo(posX + (Math.random() * 2 - 1) * 40, lo, hi)
  }

  // Calm by default: mostly idle / slow wander, with run / jump / pounce as
  // occasional treats and long idle dwell times.
  function decide(ts: number, lo: number, hi: number): void {
    const r = Math.random()
    if (r < 0.55) {
      action = 'idle'
      decideAt = ts + 2500 + Math.random() * 4000 // long, still dwell
    } else if (r < 0.85) {
      action = 'walk'
      targetX = pickTarget(lo, hi)
    } else if (r < 0.92) {
      action = 'run'
      targetX = pickTarget(lo, hi)
    } else if (r < 0.975) {
      startJump(ts, lo, hi)
    } else {
      // occasional spontaneous pounce, in place
      playOnce('play')
      action = 'idle'
      decideAt = ts + 2000 + Math.random() * 2500
    }
  }

  function frame(ts: number): void {
    if (!running) return
    if (!lastTs) lastTs = ts
    const dt = Math.min(64, ts - lastTs)
    lastTs = ts

    if (sleeping) {
      yOff = 0
      apply('sleep')
      render()
      raf = requestAnimationFrame(frame)
      return
    }
    if (oneShotState && ts < oneShotUntil) {
      yOff = 0
      apply(oneShotState)
      render()
      raf = requestAnimationFrame(frame)
      return
    }
    oneShotState = null

    const { lo, hi } = roamBounds()
    posX = clampTo(posX, lo, hi) // stay fully on-screen (also handles window shrink)

    if (action === 'jump') {
      const t = (ts - jumpStart) / JUMP_MS
      if (t >= 1) {
        posX = clampTo(jumpToX, lo, hi)
        yOff = 0
        action = 'idle'
        decideAt = ts + 1500 + Math.random() * 3000
      } else {
        yOff = -Math.sin(t * Math.PI) * JUMP_H
        posX = clampTo(jumpFromX + (jumpToX - jumpFromX) * t, lo, hi)
        dir = jumpToX >= jumpFromX ? 1 : -1
        apply('run')
      }
    } else if (action === 'walk' || action === 'run') {
      yOff = 0
      const speed = ((action === 'run' ? RUN_SPD : WALK_SPD) * dt) / 1000
      const target = clampTo(targetX, lo, hi)
      const d = target - posX
      if (Math.abs(d) <= speed) {
        posX = target
        action = 'idle'
        decideAt = ts + 1500 + Math.random() * 3000
      } else {
        dir = d > 0 ? 1 : -1
        posX += Math.sign(d) * speed
        apply(action)
      }
    } else {
      // idle
      yOff = 0
      apply('idle')
      if (ts >= decideAt) decide(ts, lo, hi)
    }

    render()
    raf = requestAnimationFrame(frame)
  }

  function start(): void {
    if (prefersReduced) {
      apply(sleeping ? 'sleep' : 'idle')
      render()
      return
    }
    if (running) return
    running = true
    lastTs = 0
    decideAt = 0
    spriteEl.style.animationPlayState = 'running'
    raf = requestAnimationFrame(frame)
  }

  function stop(): void {
    running = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    spriteEl.style.animationPlayState = 'paused'
  }

  const onVisibility = (): void => {
    if (document.hidden) stop()
    else start()
  }
  document.addEventListener('visibilitychange', onVisibility)

  function setSleeping(next: boolean): void {
    if (next === sleeping) return
    sleeping = next
    displayed = null
    action = 'idle'
    decideAt = 0
    yOff = 0
    if (prefersReduced) apply(sleeping ? 'sleep' : 'idle')
    else if (!running) start()
  }

  function remount(): void {
    mountSprite(spriteEl, getAnimal(), SCALE)
    displayed = null
  }

  function spawn(glyphs: string[]): void {
    glyphs.forEach((g, i) => {
      const el = document.createElement('span')
      el.className = 'pp-particle'
      el.textContent = g
      el.style.left = `${44 + i * 6}%`
      el.style.animationDelay = `${i * 80}ms`
      fxEl.appendChild(el)
      window.setTimeout(() => el.remove(), 1100 + i * 80)
    })
  }

  function playOnce(state: AnimState): void {
    if (sleeping) return
    const st = SPRITES[getAnimal()].states[state]
    oneShotState = state
    oneShotUntil = performance.now() + (st.frames / st.fps) * 1000
    displayed = null
  }

  function celebrate(): void {
    spawn(['❤', '✨', '❤'])
    playOnce('play')
  }
  function drink(): void {
    spawn(['💧'])
    playOnce('play')
  }
  function eat(): void {
    spawn(['🍪'])
    playOnce('play')
  }
  function nudge(): void {
    spawn(['💧'])
    playOnce('play')
  }

  function dispose(): void {
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
  }

  // initial paint
  apply('idle')
  render()

  return { start, stop, setSleeping, remount, celebrate, drink, eat, nudge, dispose }
}
