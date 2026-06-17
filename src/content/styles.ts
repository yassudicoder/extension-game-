// All styles live INSIDE the shadow root, so they cannot leak to the host page and
// the host page's CSS cannot reach them. We never inject anything into the page's
// own stylesheet. The host element itself is reset with `all: initial` (set inline
// in pet-overlay.ts) so inherited page styles don't bleed in.

export const OVERLAY_CSS = /* css */ `
  :host { all: initial; }

  .pp-wrapper {
    position: absolute;
    inset: 0;
    /* The wrapper spans the viewport but must NOT eat page clicks. */
    pointer-events: none;
  }

  .pp-pet {
    position: absolute;
    width: 72px;
    height: 72px;
    padding: 0;
    border: 0;
    background: transparent;
    /* Only the pet itself is interactive. */
    pointer-events: auto;
    cursor: grab;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.5s ease-out;
    will-change: transform;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.18));
  }
  .pp-pet:active { cursor: grabbing; }
  .pp-pet:focus-visible { outline: 2px solid #7fb5ff; outline-offset: 4px; border-radius: 12px; }

  .pp-sprite {
    width: 100%;
    height: 100%;
    transform-origin: 50% 80%;
    animation: pp-bob 3.2s ease-in-out infinite;
  }
  .pp-svg { width: 100%; height: 100%; display: block; overflow: visible; }

  .pp-cheek { fill: #f3a9b8; opacity: 0.7; }
  .pp-eye { fill: #2f2a33; }
  .pp-glint { fill: #ffffff; }
  .pp-eyeline { stroke: #2f2a33; stroke-width: 2.4; fill: none; stroke-linecap: round; }
  .pp-mouth { stroke: #2f2a33; stroke-width: 2; fill: none; stroke-linecap: round; }
  .pp-eyes-shut { display: none; }

  /* ---- moods ---- */
  .pp-sprite.happy { animation-duration: 1.8s; }
  .pp-sprite.sleepy { animation-duration: 4.6s; opacity: 0.92; }
  .pp-sprite.sleeping { animation-duration: 5.5s; }
  .pp-sprite.sleeping .pp-eyes-open { display: none; }
  .pp-sprite.sleeping .pp-eyes-shut { display: block; }

  /* gentle blink for awake moods */
  .pp-sprite:not(.sleeping) .pp-eyes-open { animation: pp-blink 5.4s infinite; transform-origin: 50% 55%; }

  /* sleeping "z z z" bubble */
  .pp-sprite.sleeping::after {
    content: 'z  z  z';
    position: absolute;
    top: -4px;
    right: -2px;
    font: 700 11px/1 ui-rounded, system-ui, sans-serif;
    color: #8aa0c0;
    letter-spacing: 1px;
    animation: pp-float 2.8s ease-in-out infinite;
  }

  /* ---- one-shot reaction effects (hearts / water drop) ---- */
  .pp-fx { position: absolute; inset: 0; pointer-events: none; }
  .pp-particle {
    position: absolute;
    left: 50%;
    top: 6px;
    font-size: 16px;
    line-height: 1;
    transform: translateX(-50%);
    animation: pp-rise 900ms ease-out forwards;
  }
  .pp-pet.react-celebrate .pp-sprite { animation: pp-pop 520ms ease-out; }
  .pp-pet.react-drink .pp-sprite { animation: pp-tip 700ms ease-in-out; }
  .pp-pet.react-nudge .pp-sprite { animation: pp-wiggle 900ms ease-in-out; }

  @keyframes pp-bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
  }
  @keyframes pp-blink {
    0%, 92%, 100% { transform: scaleY(1); }
    96% { transform: scaleY(0.1); }
  }
  @keyframes pp-pop {
    0% { transform: scale(1); }
    35% { transform: scale(1.18) translateY(-4px); }
    100% { transform: scale(1); }
  }
  @keyframes pp-tip {
    0%, 100% { transform: rotate(0); }
    40% { transform: rotate(-12deg); }
    70% { transform: rotate(4deg); }
  }
  @keyframes pp-wiggle {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }
  @keyframes pp-rise {
    0% { transform: translate(-50%, 0) scale(0.6); opacity: 0; }
    20% { opacity: 1; }
    100% { transform: translate(-50%, -42px) scale(1); opacity: 0; }
  }
  @keyframes pp-float {
    0%, 100% { transform: translateY(0); opacity: 0.6; }
    50% { transform: translateY(-4px); opacity: 1; }
  }

  /* ---- respect reduced-motion: no looping/jittery animation ---- */
  @media (prefers-reduced-motion: reduce) {
    .pp-pet { transition: none; }
    .pp-sprite,
    .pp-sprite:not(.sleeping) .pp-eyes-open,
    .pp-sprite.sleeping::after { animation: none !important; }
    .pp-particle { animation-duration: 1ms; }
    .pp-pet.react-celebrate .pp-sprite,
    .pp-pet.react-drink .pp-sprite,
    .pp-pet.react-nudge .pp-sprite { animation: none; }
  }
`
