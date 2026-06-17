// Generates PLACEHOLDER pixel-art sprite sheets (zero deps) for cat / dog / bunny.
// Chunky, cute, side-on critters posed parametrically across five animations.
// Layout MUST match the SPRITES manifest in src/shared/sprites.ts:
//   frame 32x32, cols 6, rows 5  ->  sheet 192x160
//   row 0 idle(4)  row 1 walk(6)  row 2 run(6)  row 3 play(4)  row 4 sleep(2)
//
// These are deliberately simple stand-ins. To use real art: drop your own
// {cat,dog,bunny}.png into src/assets/sprites/ (this script skips files that
// already exist) and adjust the manifest layout. Then `npm run build`.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(here, '..', 'src', 'assets', 'sprites')

const FRAME = 32
const COLS = 6
const ROWS = 5
const W = COLS * FRAME // 192
const H = ROWS * FRAME // 160

const EYE = [43, 40, 49]
const GLINT = [255, 255, 255]

const MODELS = {
  cat: {
    body: [167, 176, 191],
    belly: [212, 218, 228],
    line: [86, 91, 105],
    ear: [151, 160, 176],
    nose: [231, 136, 155],
    accent: [245, 188, 201],
    type: 'cat',
  },
  dog: {
    body: [216, 170, 113],
    belly: [243, 222, 188],
    line: [126, 95, 61],
    ear: [193, 146, 92],
    nose: [78, 61, 49],
    accent: [245, 188, 201],
    type: 'dog',
  },
  bunny: {
    body: [240, 236, 240],
    belly: [255, 255, 255],
    line: [201, 190, 204],
    ear: [232, 219, 227],
    nose: [231, 140, 162],
    accent: [245, 188, 201],
    type: 'bunny',
  },
}

// ---- low-level raster on the whole sheet ----
function makeBuf() {
  return Buffer.alloc(W * H * 4)
}
function blend(buf, x, y, [r, g, b], a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return
  const i = (y * W + x) * 4
  const da = buf[i + 3] / 255
  const oa = a + da * (1 - a)
  if (oa <= 0) return
  buf[i] = Math.round((r * a + buf[i] * da * (1 - a)) / oa)
  buf[i + 1] = Math.round((g * a + buf[i + 1] * da * (1 - a)) / oa)
  buf[i + 2] = Math.round((b * a + buf[i + 2] * da * (1 - a)) / oa)
  buf[i + 3] = Math.round(oa * 255)
}

// ---- per-cell pixel pen (local coords 0..31) ----
function pen(buf, ox, oy) {
  const P = (x, y, c, a = 1) => blend(buf, ox + Math.round(x), oy + Math.round(y), c, a)
  const R = (x, y, w, h, c, a = 1) => {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) P(x + xx, y + yy, c, a)
  }
  const ell = (cx, cy, rx, ry, c, a = 1) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx
        const dy = (y - cy) / ry
        if (dx * dx + dy * dy <= 1) P(x, y, c, a)
      }
    }
  }
  // filled ellipse with a 1px darker outline
  const blob = (cx, cy, rx, ry, fill, line) => {
    ell(cx, cy, rx, ry, line)
    ell(cx, cy, rx - 1, ry - 1, fill)
  }
  // rounded upward ear
  const earUp = (ax, ay, half, h, fill, line) => {
    for (let i = 0; i < h; i++) {
      const w = Math.round((half * (h - i + 1)) / h)
      R(ax - w, ay - i, 2 * w + 1, 1, i >= h - 2 ? line : fill)
    }
  }
  return { P, R, ell, blob, earUp }
}

// ---- the critter: chunky, big-headed, stubby-legged ----
function drawStanding(buf, ox, oy, M, p) {
  const { P, R, ell, blob, earUp } = pen(buf, ox, oy)
  const cy = 16 + (p.crouch || 0) - (p.air || 0) + (p.bob || 0)
  const lean = p.stretch || 0
  const bx = 13
  const hcx = 22 + lean
  const hcy = cy - 2

  // tail (behind the body)
  if (M.type === 'cat') {
    blob(5, cy - 2 + (p.tail || 0), 2, 5, M.body, M.line)
    blob(5, cy - 6 + (p.tail || 0), 2, 2, M.body, M.line)
  } else if (M.type === 'dog') {
    blob(4, cy - 3 + (p.tail || 0), 2, 3, M.body, M.line)
  } else {
    blob(4, cy + 5, 3, 3, M.belly, M.line) // bunny puff
  }

  // four stubby legs (drawn first; the body covers their tops)
  for (const lx of [6, 10, 17, 21]) {
    const front = lx >= 16
    const sw = Math.round(Math.sin((p.legPhase || 0) + (front ? 0 : Math.PI)) * (p.legAmp || 0))
    R(lx + sw, 24, 3, 5, M.body)
    R(lx + sw, 28, 3, 1, M.line)
  }

  // big round body + rump + belly
  blob(bx, cy + 4, 11, 8, M.body, M.line)
  blob(bx - 6, cy + 4, 6, 7, M.body, M.line)
  ell(bx, cy + 7, 8, 4, M.belly)

  // big head, overlapping the body
  blob(hcx, hcy, 8, 7, M.body, M.line)

  // ears
  if (M.type === 'cat') {
    earUp(hcx - 4, hcy - 4, 3, 6, M.ear, M.line)
    earUp(hcx + 4, hcy - 4, 3, 6, M.ear, M.line)
    P(hcx - 4, hcy - 2, M.accent)
    P(hcx + 4, hcy - 2, M.accent)
  } else if (M.type === 'dog') {
    blob(hcx - 7, hcy + 1, 3, 5, M.ear, M.line) // big floppy ears
    blob(hcx + 7, hcy + 1, 3, 5, M.ear, M.line)
  } else {
    const back = p.earBack ? -2 : 0
    for (const ex of [hcx - 3, hcx + 3]) {
      blob(ex + back, hcy - 7, 2.4, 6, M.ear, M.line)
      R(ex + back, hcy - 9, 1, 6, M.accent)
    }
  }

  // cheeks
  ell(hcx - 5, hcy + 3, 1.8, 1.4, M.accent, 0.85)
  ell(hcx + 5, hcy + 3, 1.8, 1.4, M.accent, 0.85)

  // big eyes (two, facing the viewer a touch)
  if (p.eye === 'shut') {
    R(hcx - 4, hcy + 1, 3, 1, EYE)
    R(hcx + 2, hcy + 1, 3, 1, EYE)
  } else {
    ell(hcx - 3, hcy + 1, 1.7, 2.2, EYE)
    ell(hcx + 3, hcy + 1, 1.7, 2.2, EYE)
    P(hcx - 3, hcy, GLINT)
    P(hcx + 3, hcy, GLINT)
  }

  // nose + mouth
  P(hcx, hcy + 4, M.nose)
  P(hcx + 1, hcy + 4, M.nose)
  if (p.mouth) R(hcx - 1, hcy + 6, 3, 1, M.line)

  // play sparkle
  if (p.spark) {
    const sx = hcx + 6
    const sy = hcy - 6
    P(sx, sy - 1, M.accent)
    P(sx, sy + 1, M.accent)
    P(sx - 1, sy, M.accent)
    P(sx + 1, sy, M.accent)
  }
}

function drawSleeping(buf, ox, oy, M, f) {
  const { P, R, ell, blob } = pen(buf, ox, oy)
  const cy = 23 - (f === 1 ? 1 : 0) // gentle breathing
  // big round loaf
  blob(15, cy, 11, 6, M.body, M.line)
  ell(15, cy + 2, 8, 3, M.belly)
  // head tucked at the front
  blob(23, cy - 1, 6, 5, M.body, M.line)
  // relaxed ears
  if (M.type === 'cat') {
    blob(20, cy - 5, 2, 2.4, M.ear, M.line)
  } else if (M.type === 'dog') {
    blob(19, cy + 1, 2.4, 3, M.ear, M.line)
  } else {
    blob(14, cy - 3, 4, 2, M.ear, M.line)
  }
  // tail wrapped round the front
  blob(7, cy + 1, 3, 3, M.body, M.line)
  // closed eye + nose
  R(23, cy - 1, 3, 1, EYE)
  P(27, cy, M.nose)
  // "z z" floating up
  if (f === 0) {
    P(28, cy - 7, [126, 140, 168])
    P(29, cy - 8, [126, 140, 168])
    P(30, cy - 9, [126, 140, 168])
  }
}

// ---- per-state pose tables ----
function poseFor(type, state, f, n) {
  const phase = (f / n) * Math.PI * 2
  switch (state) {
    case 'idle':
      return { bob: [0, -1, 0, -1][f] ?? 0, legAmp: 0, eye: f === 3 ? 'shut' : 'open', tail: [0, 1, 0, -1][f] ?? 0 }
    case 'walk':
      return { legPhase: phase, legAmp: 1.6, bob: Math.sin(phase * 2) < -0.3 ? -1 : 0, eye: 'open', tail: Math.round(Math.sin(phase)) }
    case 'run': {
      const hop = type === 'bunny' ? 4 : 3
      return {
        legPhase: phase,
        legAmp: 2.2,
        air: Math.round((Math.sin(phase) * 0.5 + 0.5) * hop),
        earBack: true,
        stretch: 1,
        eye: 'open',
      }
    }
    case 'play': {
      const tbl = [
        { crouch: 2, eye: 'open', legAmp: 0 },
        { air: 2, mouth: true, eye: 'open' },
        { air: 5, mouth: true, spark: true, eye: 'open' },
        { crouch: 1, mouth: true, eye: 'open' },
      ]
      return tbl[f] ?? tbl[0]
    }
    default:
      return {}
  }
}

const STATES = [
  { name: 'idle', row: 0, frames: 4 },
  { name: 'walk', row: 1, frames: 6 },
  { name: 'run', row: 2, frames: 6 },
  { name: 'play', row: 3, frames: 4 },
  { name: 'sleep', row: 4, frames: 2 },
]

function makeSheet(M) {
  const buf = makeBuf()
  for (const st of STATES) {
    for (let f = 0; f < st.frames; f++) {
      const ox = f * FRAME
      const oy = st.row * FRAME
      if (st.name === 'sleep') drawSleeping(buf, ox, oy, M, f)
      else drawStanding(buf, ox, oy, M, poseFor(M.type, st.name, f, st.frames))
    }
  }
  return encodePng(W, H, buf)
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [animal, model] of Object.entries(MODELS)) {
  const out = join(OUT_DIR, `${animal}.png`)
  if (existsSync(out)) {
    console.log(`skip ${animal}.png (already present)`)
    continue
  }
  writeFileSync(out, makeSheet(model))
  console.log(`wrote ${animal}.png  (${W}x${H})`)
}
