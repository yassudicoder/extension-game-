import type { Animal } from './types'
import { SHEETS } from './sprites.generated'

// Pixel-art sprites. Each animal has ONE sheet (a grid of equal 32x32 cells); each
// row is one animation. Sheets are inlined as base64 data URIs (see SHEETS) so
// there's no remote code and no web_accessible_resources entry.
//
// Rendering uses CSS `steps()` to cycle background-position across a row, plus a
// single shared keyframe (`pp-cycle`, defined in the overlay + popup stylesheets):
//   @keyframes pp-cycle { to { background-position-x: var(--pp-x1); } }
// The element's base background-position-x is the first frame; the animation steps
// to --pp-x1 (one cell past the last frame) in `frames` steps. This works at ANY
// integer scale, so overlay / popup-hero / resident-thumbnail can each pick a size.

export type AnimState = 'idle' | 'walk' | 'run' | 'play' | 'sleep'

export interface StateDef {
  /** row index in the sheet */
  row: number
  /** first column of this animation */
  from: number
  /** number of frames */
  frames: number
  /** playback speed */
  fps: number
  loop: boolean
}

export interface SpriteDef {
  sheet: string
  frameW: number
  frameH: number
  cols: number
  rows: number
  /** default integer upscale for crisp pixels */
  scale: number
  states: Record<AnimState, StateDef>
}

// Layout MUST match scripts/gen-placeholder-sprites.mjs.
// ── To drop in your OWN art: replace src/assets/sprites/{animal}.png and edit the
//    numbers below to match your sheet (one block per animal). That's the only edit.
const LAYOUT: Omit<SpriteDef, 'sheet'> = {
  frameW: 32,
  frameH: 32,
  cols: 6,
  rows: 5,
  scale: 3,
  states: {
    idle: { row: 0, from: 0, frames: 4, fps: 4, loop: true },
    walk: { row: 1, from: 0, frames: 6, fps: 9, loop: true },
    run: { row: 2, from: 0, frames: 6, fps: 14, loop: true },
    play: { row: 3, from: 0, frames: 4, fps: 10, loop: false },
    sleep: { row: 4, from: 0, frames: 2, fps: 1.2, loop: true },
  },
}

export const SPRITES: Record<Animal, SpriteDef> = {
  cat: { sheet: SHEETS.cat, ...LAYOUT },
  dog: { sheet: SHEETS.dog, ...LAYOUT },
  bunny: { sheet: SHEETS.bunny, ...LAYOUT },
}

// ---- render helpers (shared by the overlay and the popup) ----

/** Set up an element to display an animal's sheet at the given integer scale. */
export function mountSprite(el: HTMLElement, animal: Animal, scale: number): void {
  const def = SPRITES[animal]
  const cellW = def.frameW * scale
  const cellH = def.frameH * scale
  el.classList.add('pp-pixel')
  el.style.width = `${cellW}px`
  el.style.height = `${cellH}px`
  el.style.backgroundImage = `url("${def.sheet}")`
  el.style.backgroundSize = `${def.cols * cellW}px ${def.rows * cellH}px`
}

/** Play an animation state (CSS steps). Restarts even if re-applying the same state. */
export function setSpriteState(
  el: HTMLElement,
  animal: Animal,
  state: AnimState,
  scale: number,
): void {
  const def = SPRITES[animal]
  const st = def.states[state]
  const cellW = def.frameW * scale
  const cellH = def.frameH * scale
  const x0 = -(st.from * cellW)
  const x1 = -((st.from + st.frames) * cellW)
  const dur = st.frames / st.fps

  el.style.animation = 'none'
  void el.offsetWidth // reflow so the animation restarts cleanly
  el.style.backgroundPositionX = `${x0}px`
  el.style.backgroundPositionY = `${-(st.row * cellH)}px`
  el.style.setProperty('--pp-x1', `${x1}px`)
  el.style.animation = `pp-cycle ${dur}s steps(${st.frames}) ${st.loop ? 'infinite' : '1'}`
}

/** Show a single static frame with no animation (for thumbnails / reduced motion). */
export function setStaticFrame(
  el: HTMLElement,
  animal: Animal,
  state: AnimState,
  frame: number,
  scale: number,
): void {
  const def = SPRITES[animal]
  const st = def.states[state]
  const cellW = def.frameW * scale
  const cellH = def.frameH * scale
  el.style.animation = 'none'
  el.style.backgroundPositionX = `${-((st.from + frame) * cellW)}px`
  el.style.backgroundPositionY = `${-(st.row * cellH)}px`
}
