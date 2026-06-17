// Generates the extension's PNG icons with zero dependencies.
// A tiny pastel pet face at 16/32/48/128. Run via `npm run icons` (also part of build).
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(here, '..', 'src', 'assets', 'icons')

// ---- draw a friendly pet face (anti-aliased — these are app icons, not pixel art) ----
function makeIcon(S) {
  const buf = Buffer.alloc(S * S * 4) // fully transparent

  const blend = (x, y, [r, g, b], a) => {
    if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return
    const i = (y * S + x) * 4
    const da = buf[i + 3] / 255
    const oa = a + da * (1 - a)
    if (oa <= 0) return
    buf[i] = Math.round((r * a + buf[i] * da * (1 - a)) / oa)
    buf[i + 1] = Math.round((g * a + buf[i + 1] * da * (1 - a)) / oa)
    buf[i + 2] = Math.round((b * a + buf[i + 2] * da * (1 - a)) / oa)
    buf[i + 3] = Math.round(oa * 255)
  }

  const disc = (cx, cy, r, color, alpha = 1) => {
    const x0 = Math.max(0, Math.floor(cx - r - 1))
    const x1 = Math.min(S - 1, Math.ceil(cx + r + 1))
    const y0 = Math.max(0, Math.floor(cy - r - 1))
    const y1 = Math.min(S - 1, Math.ceil(cy + r + 1))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        const cov = Math.max(0, Math.min(1, r + 0.5 - d))
        if (cov > 0) blend(x, y, color, cov * alpha)
      }
    }
  }

  const BODY = [157, 192, 240]
  const EAR = [134, 169, 220]
  const EYE = [47, 42, 51]
  const CHEEK = [243, 169, 184]

  disc(S * 0.32, S * 0.3, S * 0.15, EAR)
  disc(S * 0.68, S * 0.3, S * 0.15, EAR)
  disc(S * 0.5, S * 0.56, S * 0.36, BODY)
  disc(S * 0.3, S * 0.64, S * 0.055, CHEEK, 0.85)
  disc(S * 0.7, S * 0.64, S * 0.055, CHEEK, 0.85)
  disc(S * 0.4, S * 0.54, S * 0.05, EYE)
  disc(S * 0.6, S * 0.54, S * 0.05, EYE)

  return encodePng(S, S, buf)
}

mkdirSync(OUT_DIR, { recursive: true })
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(OUT_DIR, `icon-${size}.png`), makeIcon(size))
  console.log(`wrote icon-${size}.png`)
}
