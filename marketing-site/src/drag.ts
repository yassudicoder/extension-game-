// Pick-up-the-animal drag system — the site's signature interaction.
//
// It generalises the hero's 1D wanderers (petController / critterController) into
// 2D: pointerdown grabs an animal, it lifts and follows the pointer, and on release
// it falls to its ground band with a squash-bounce and resumes wandering from there.
// Pointer events cover mouse + touch from one path.
//
// State machine:   wander → grabbed → falling → landing → wander
//
// Tap vs drag: a press that never passes DRAG_THRESHOLD is a *tap* (the existing
// "pet → heart"); only real movement starts a grab. On touch, a dominantly-vertical
// first move is handed back to the page so scrolling never grabs an animal.

export const DRAG_THRESHOLD = 6 // px of travel before a press becomes a grab
const LIFT = 0.14 // extra uniform scale while held ("picked up")
const FALL_MS = 320 // grab-release → ground
const LAND_MS = 260 // squash-bounce on touchdown

export interface Pose {
  x: number // translateX px — also the controller's autonomous walk position
  y: number // translateY px — 0 sits on the ground band; negative = lifted
  faceX: 1 | -1 // horizontal flip (already accounts for sprite/strip orientation)
  squashY: number // 1 = rest; <1 squashed; >1 stretched
  rot: number // degrees — pick-up wiggle / drag lean / landing shake
  lift: number // extra uniform scale while held (0 at rest)
}

export function newPose(): Pose {
  return { x: -1, y: 0, faceX: 1, squashY: 1, rot: 0, lift: 0 }
}

/** The single writer of an animal's transform — composes every pose channel. */
export function applyPose(el: HTMLElement, p: Pose): void {
  const sx = (p.faceX * (1 + p.lift)).toFixed(3)
  const sy = (p.squashY * (1 + p.lift)).toFixed(3)
  el.style.transform =
    `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) ` +
    `rotate(${p.rot.toFixed(2)}deg) scaleX(${sx}) scaleY(${sy})`
}

export type Phase = 'wander' | 'grabbed' | 'falling' | 'landing'

export interface DragHooks {
  pose: Pose
  /** translateX bounds of the ground band, for the landing clamp. */
  bandX: () => { min: number; max: number }
  /** translateY of the ground line under x (0 in the hero; per-section elsewhere). */
  groundY?: (x: number) => number
  onGrab?: () => void // pause autonomy, raise z + grow the shadow
  onResume?: () => void // restore z/shadow, hand back to autonomy
  onTap?: () => void // a tap with no drag — pet the animal
  onLand?: () => void // touchdown fx (dust puff / pond splash); reads el rect itself
}

export interface Dragger {
  /** Current phase; the owning controller's loop reads this each frame. */
  readonly phase: Phase
  /** Advance grabbed/falling/landing motion one frame (no-op while wandering). */
  tick(ts: number, dt: number): void
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/**
 * Wire pointer-driven dragging onto `el`, mutating the shared `pose`. The owning
 * controller keeps running its rAF loop: while `phase === 'wander'` it integrates
 * autonomous motion as before; otherwise it calls `tick()` and lets the dragger pose
 * the element. Only attach under motion (reduced-motion stays a calm static scene).
 */
export function makeDraggable(el: HTMLElement, h: DragHooks): Dragger {
  const groundY = h.groundY ?? (() => 0)
  let phase: Phase = 'wander'

  // press bookkeeping
  let armed = false
  let grabbed = false
  let pointerId = -1
  let startX = 0
  let startY = 0
  let startT = 0

  // grab anchor (set when a press becomes a grab, so there's no jump)
  let anchorX = 0
  let anchorY = 0
  let baseX = 0
  let baseY = 0
  let grabT = 0
  let vx = 0 // px/ms, smoothed — drives the lean
  let lastMoveX = 0
  let lastMoveT = 0

  // fall/landing bookkeeping
  let t0 = 0
  let fromY = 0
  let toY = 0
  let fromX = 0
  let toX = 0
  let fromRot = 0
  let fromLift = 0

  const beginFall = () => {
    const { min, max } = h.bandX()
    fromX = h.pose.x
    toX = clamp(h.pose.x, min, max)
    fromY = h.pose.y
    toY = groundY(toX)
    fromRot = h.pose.rot
    fromLift = h.pose.lift
    t0 = performance.now()
    phase = 'falling'
  }

  const endPress = () => {
    armed = false
    grabbed = false
    el.classList.remove('is-grabbed')
    try {
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
    } catch {
      /* capture already gone */
    }
  }

  el.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!e.isPrimary) return
    if (phase === 'falling' || phase === 'landing') return // let it finish landing
    armed = true
    grabbed = false
    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    startT = performance.now()
    // Capture so moves/up arrive even if the pointer leaves the small sprite. This
    // does NOT block scrolling on its own — a scroll gesture fires pointercancel.
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* setPointerCapture unsupported — falls back to element-local events */
    }
  })

  el.addEventListener('pointermove', (e: PointerEvent) => {
    if (!armed || e.pointerId !== pointerId) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    if (!grabbed) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      // Touch: a dominantly-vertical first move is the page scrolling — bow out so
      // the animal is never grabbed mid-scroll. Mouse always grabs on movement.
      if (e.pointerType !== 'mouse' && Math.abs(dy) > Math.abs(dx)) {
        endPress()
        return
      }
      // promote to a real grab, anchored at the current point (no jump)
      grabbed = true
      phase = 'grabbed'
      anchorX = e.clientX
      anchorY = e.clientY
      baseX = h.pose.x
      baseY = h.pose.y
      grabT = performance.now()
      lastMoveX = e.clientX
      lastMoveT = grabT
      vx = 0
      el.classList.add('is-grabbed')
      h.onGrab?.()
      // let the page know a real grab happened (the "drag me!" hint listens once)
      document.dispatchEvent(new CustomEvent('pp-grab'))
    }

    // drive the position straight from the pointer (no rAF latency) so a release
    // always lands from the exact spot, even between animation frames
    h.pose.x = baseX + (e.clientX - anchorX)
    h.pose.y = baseY + (e.clientY - anchorY)
    const now = performance.now()
    const dtm = now - lastMoveT
    if (dtm > 0) {
      const inst = (e.clientX - lastMoveX) / dtm
      vx = vx * 0.6 + inst * 0.4 // smooth
      lastMoveX = e.clientX
      lastMoveT = now
    }
    e.preventDefault() // now dragging: suppress scroll + text selection
  })

  const up = (e: PointerEvent) => {
    if (!armed || e.pointerId !== pointerId) return
    if (grabbed) {
      beginFall()
      endPress()
    } else {
      // a tap (no drag past threshold) pets the animal
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY)
      const quick = performance.now() - startT < 400
      endPress()
      if (dist < DRAG_THRESHOLD && quick) h.onTap?.()
    }
  }
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    if (grabbed) beginFall() // a cancelled drag still drops the animal
    endPress()
  })

  const tick = (ts: number, dt: number): void => {
    const p = h.pose
    if (phase === 'grabbed') {
      // position is set live in pointermove; here we only ease the "held" feel
      p.lift += (LIFT - p.lift) * Math.min(1, dt / 90)
      const tilt = clamp(vx * 6, -16, 16)
      const age = ts - grabT
      const wiggle = age < 260 ? Math.sin(age / 38) * 7 * Math.exp(-age / 150) : 0
      p.rot += (tilt + wiggle - p.rot) * Math.min(1, dt / 70)
      p.squashY += (0.98 - p.squashY) * Math.min(1, dt / 120)
      vx *= 0.86 // relax the lean when the pointer holds still
    } else if (phase === 'falling') {
      const q = clamp((ts - t0) / FALL_MS, 0, 1)
      p.y = fromY + (toY - fromY) * (q * q) // accelerate downward
      p.x = fromX + (toX - fromX) * (1 - (1 - q) * (1 - q)) // ease into band
      p.rot = fromRot * (1 - q)
      p.lift = fromLift * (1 - q)
      if (q >= 1) {
        p.y = toY
        p.x = toX
        p.rot = 0
        p.lift = 0
        phase = 'landing'
        t0 = ts
        h.onLand?.()
      }
    } else if (phase === 'landing') {
      const q = clamp((ts - t0) / LAND_MS, 0, 1)
      p.squashY = 1 - 0.3 * Math.exp(-q * 6) * Math.cos(q * 22) // damped jelly bounce
      p.rot = 2.5 * Math.exp(-q * 6) * Math.cos(q * 22)
      if (q >= 1) {
        p.squashY = 1
        p.rot = 0
        phase = 'wander'
        h.onResume?.()
      }
    }
  }

  return {
    get phase() {
      return phase
    },
    tick,
  }
}
