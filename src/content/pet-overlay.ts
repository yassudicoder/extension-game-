import type { PetPosition, PetState } from '../shared/types'
import { loadState, onStateChanged } from '../shared/storage'
import { MSG, sendMessage } from '../shared/messages'
import { petMood } from '../shared/wellbeing'
import { OVERLAY_CSS } from './styles'
import { createAnimator } from './pet-animator'

const HOST_ID = 'pocket-pet-host'
const PET_SIZE = 64
const MARGIN = 8
const DRAG_THRESHOLD = 6

function applyHidden(host: HTMLElement, hidden: boolean): void {
  host.style.display = hidden ? 'none' : 'block'
}

/** Keep an anchored position on-screen for the current viewport size. */
function clampPosition(pos: PetPosition): PetPosition {
  const maxX = Math.max(MARGIN, window.innerWidth - PET_SIZE - MARGIN)
  const maxY = Math.max(MARGIN, window.innerHeight - PET_SIZE - MARGIN)
  return { ...pos, dx: Math.min(pos.dx, maxX), dy: Math.min(pos.dy, maxY) }
}

function applyPosition(petEl: HTMLElement, pos: PetPosition): void {
  for (const side of ['left', 'right', 'top', 'bottom']) petEl.style.removeProperty(side)
  const horiz = pos.corner.endsWith('r') ? 'right' : 'left'
  const vert = pos.corner.startsWith('b') ? 'bottom' : 'top'
  petEl.style.setProperty(horiz, `${pos.dx}px`)
  petEl.style.setProperty(vert, `${pos.dy}px`)
}

/** Map a pointer location to the nearest-corner anchored position, kept on-screen. */
function positionFromPoint(x: number, y: number): PetPosition {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const right = x > vw / 2
  const bottom = y > vh / 2
  const corner = `${bottom ? 'b' : 't'}${right ? 'r' : 'l'}` as PetPosition['corner']
  const maxX = Math.max(MARGIN, vw - PET_SIZE - MARGIN)
  const maxY = Math.max(MARGIN, vh - PET_SIZE - MARGIN)
  const clamp = (v: number, hi: number) => Math.min(hi, Math.max(MARGIN, v))
  const dx = clamp(right ? vw - x - PET_SIZE / 2 : x - PET_SIZE / 2, maxX)
  const dy = clamp(bottom ? vh - y - PET_SIZE / 2 : y - PET_SIZE / 2, maxY)
  return { corner, dx, dy }
}

export async function mountPet(): Promise<void> {
  if (document.getElementById(HOST_ID)) return
  if (!document.body) {
    window.addEventListener('DOMContentLoaded', () => void mountPet(), { once: true })
    return
  }

  const host = document.createElement('div')
  host.id = HOST_ID
  // display:block is set explicitly: the shadow CSS uses `:host { all: initial }`,
  // which resets display to `inline` — without this the overlay's box behaviour
  // would depend on load order.
  host.style.cssText =
    'display:block;position:fixed;inset:0;margin:0;padding:0;border:0;background:none;pointer-events:none;z-index:2147483647;'
  document.documentElement.appendChild(host)

  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = OVERLAY_CSS
  root.appendChild(style)

  const wrapper = document.createElement('div')
  wrapper.className = 'pp-wrapper'
  const petEl = document.createElement('button')
  petEl.type = 'button'
  petEl.className = 'pp-pet'
  petEl.setAttribute('aria-label', 'Your Pocket Pet — click to pet it, drag to move it')
  const spriteEl = document.createElement('div')
  spriteEl.className = 'pp-sprite pp-pixel'
  const fxEl = document.createElement('div')
  fxEl.className = 'pp-fx'
  petEl.append(spriteEl, fxEl)
  wrapper.append(petEl)
  root.append(wrapper)

  let state: PetState = await loadState(Date.now())
  applyPosition(petEl, state.position)
  applyHidden(host, state.hidden)

  const animator = createAnimator(petEl, spriteEl, fxEl, () => state.animal)
  animator.setSleeping(petMood(state, Date.now()) === 'sleeping')
  if (!state.hidden) animator.start()

  // Stay in sync with storage (single source of truth). We only READ here.
  onStateChanged((next) => {
    const prev = state
    state = next

    if (next.animal !== prev.animal) animator.remount()
    if (next.hidden !== prev.hidden) {
      applyHidden(host, next.hidden)
      if (next.hidden) animator.stop()
      else animator.start()
    }
    if (!next.hidden) applyPosition(petEl, next.position)
    animator.setSleeping(petMood(next, Date.now()) === 'sleeping')

    if (next.lastWaterAt && next.lastWaterAt !== prev.lastWaterAt) animator.drink()
    if (next.lastFedAt && next.lastFedAt !== prev.lastFedAt) animator.eat()
    if (
      next.lastNudgeAt &&
      next.lastNudgeAt !== prev.lastNudgeAt &&
      Date.now() - next.lastNudgeAt < 15_000
    ) {
      animator.nudge()
    }
  })

  // Keep the pet on-screen if the viewport shrinks (visual only; not persisted).
  window.addEventListener('resize', () => {
    if (!state.hidden) applyPosition(petEl, clampPosition(state.position))
  })

  // ---- drag-to-reposition vs. click-to-pet ----
  let dragging = false
  let moved = false
  let startX = 0
  let startY = 0
  let livePos: PetPosition = state.position

  petEl.addEventListener('pointerdown', (e) => {
    dragging = true
    moved = false
    startX = e.clientX
    startY = e.clientY
    livePos = state.position
    petEl.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  petEl.addEventListener('pointermove', (e) => {
    if (!dragging) return
    if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > DRAG_THRESHOLD) moved = true
    if (moved) {
      livePos = positionFromPoint(e.clientX, e.clientY)
      applyPosition(petEl, livePos)
    }
  })
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    try {
      petEl.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
    if (moved) {
      state = { ...state, position: livePos }
      void sendMessage({ type: MSG.SET_POSITION, position: livePos })
    } else {
      animator.celebrate()
      void sendMessage({ type: MSG.PET_CLICKED })
    }
  }
  petEl.addEventListener('pointerup', endDrag)
  petEl.addEventListener('pointercancel', endDrag)
  petEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      animator.celebrate()
      void sendMessage({ type: MSG.PET_CLICKED })
    }
  })
}
