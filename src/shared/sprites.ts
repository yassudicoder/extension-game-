import type { Animal } from './types'

// Inline SVG sprites. Kept in /shared so both the on-page overlay and the popup
// preview render the exact same pet. Inlining (vs. <img src> assets) means:
//   - no web_accessible_resources entry is needed,
//   - nothing is fetched at runtime (CSP-safe on strict pages),
//   - no remote code (MV3 policy).
// Every sprite shares the same element classes so one stylesheet can theme + animate
// all three animals (open vs. shut eyes, blink, cheek colour, etc.).

const PALETTE: Record<Animal, { body: string; ear: string; accent: string }> = {
  cat: { body: '#b9c2cf', ear: '#a6b0bf', accent: '#f3a9b8' },
  dog: { body: '#e2c19b', ear: '#caa17e', accent: '#f3a9b8' },
  bunny: { body: '#f3eef0', ear: '#e7dde1', accent: '#f3a9b8' },
}

function face(): string {
  // shared face: open eyes (default) + shut eyes (shown when .pp-sprite is sleeping)
  return `
    <circle class="pp-cheek" cx="31" cy="66" r="5.5" />
    <circle class="pp-cheek" cx="69" cy="66" r="5.5" />
    <g class="pp-eyes-open">
      <circle class="pp-eye" cx="40" cy="55" r="4.6" />
      <circle class="pp-eye" cx="60" cy="55" r="4.6" />
      <circle class="pp-glint" cx="41.6" cy="53.4" r="1.5" />
      <circle class="pp-glint" cx="61.6" cy="53.4" r="1.5" />
    </g>
    <g class="pp-eyes-shut">
      <path class="pp-eyeline" d="M35 56 q5 4 10 0" />
      <path class="pp-eyeline" d="M55 56 q5 4 10 0" />
    </g>
    <path class="pp-mouth" d="M46 65 q4 4 8 0" />
  `
}

function catSprite(p: (typeof PALETTE)['cat']): string {
  return `
    <path class="pp-ear" d="M26 40 L31 14 L48 34 Z" fill="${p.ear}" />
    <path class="pp-ear" d="M74 40 L69 14 L52 34 Z" fill="${p.ear}" />
    <path class="pp-ear-inner" d="M31 33 L33 20 L42 32 Z" fill="${p.accent}" />
    <path class="pp-ear-inner" d="M69 33 L67 20 L58 32 Z" fill="${p.accent}" />
    <ellipse class="pp-body" cx="50" cy="60" rx="33" ry="31" fill="${p.body}" />
    ${face()}
  `
}

function dogSprite(p: (typeof PALETTE)['dog']): string {
  return `
    <ellipse class="pp-ear" cx="20" cy="56" rx="11" ry="20" fill="${p.ear}" />
    <ellipse class="pp-ear" cx="80" cy="56" rx="11" ry="20" fill="${p.ear}" />
    <ellipse class="pp-body" cx="50" cy="58" rx="33" ry="31" fill="${p.body}" />
    <ellipse class="pp-snout" cx="50" cy="70" rx="15" ry="11" fill="#fff7ee" opacity="0.7" />
    ${face()}
  `
}

function bunnySprite(p: (typeof PALETTE)['bunny']): string {
  return `
    <ellipse class="pp-ear" cx="38" cy="22" rx="7" ry="22" fill="${p.ear}" />
    <ellipse class="pp-ear" cx="62" cy="22" rx="7" ry="22" fill="${p.ear}" />
    <ellipse class="pp-ear-inner" cx="38" cy="24" rx="3" ry="15" fill="${p.accent}" />
    <ellipse class="pp-ear-inner" cx="62" cy="24" rx="3" ry="15" fill="${p.accent}" />
    <ellipse class="pp-body" cx="50" cy="62" rx="32" ry="29" fill="${p.body}" />
    ${face()}
  `
}

/** Returns the inner SVG markup for an animal (no wrapping <svg> element). */
export function spriteInner(animal: Animal): string {
  const p = PALETTE[animal]
  switch (animal) {
    case 'cat':
      return catSprite(p)
    case 'dog':
      return dogSprite(p)
    case 'bunny':
      return bunnySprite(p)
  }
}

/** Returns a complete, self-contained <svg> string for an animal. */
export function spriteSvg(animal: Animal): string {
  return `<svg class="pp-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${spriteInner(animal)}</svg>`
}
