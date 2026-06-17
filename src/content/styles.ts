// All styles live INSIDE the shadow root, so they cannot leak to the host page and
// the host page's CSS cannot reach them. The host element itself is reset with
// `all: initial` (and an explicit display:block, set inline in pet-overlay.ts).

export const OVERLAY_CSS = /* css */ `
  :host { all: initial; }

  .pp-wrapper {
    position: absolute;
    inset: 0;
    /* Spans the viewport but must NOT eat page clicks. */
    pointer-events: none;
  }

  .pp-pet {
    position: absolute;
    width: 64px;
    height: 64px;
    padding: 0;
    border: 0;
    background: transparent;
    /* Only the pet itself is interactive. */
    pointer-events: auto;
    cursor: grab;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    will-change: transform;
    display: grid;
    place-items: center;
    filter: drop-shadow(0 4px 5px rgba(0, 0, 0, 0.22));
  }
  .pp-pet:active { cursor: grabbing; }
  .pp-pet:focus-visible { outline: 2px solid #7fb5ff; outline-offset: 4px; border-radius: 10px; }

  /* crisp upscaled pixels */
  .pp-pixel {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    background-repeat: no-repeat;
  }
  .pp-sprite { width: 64px; height: 64px; }

  /* the single shared keyframe that drives every state's frame-stepping */
  @keyframes pp-cycle {
    to { background-position-x: var(--pp-x1); }
  }

  /* one-shot reaction particles (hearts / water drop) */
  .pp-fx { position: absolute; inset: 0; pointer-events: none; }
  .pp-particle {
    position: absolute;
    left: 50%;
    top: 2px;
    font-size: 15px;
    line-height: 1;
    transform: translateX(-50%);
    animation: pp-rise 950ms ease-out forwards;
  }
  @keyframes pp-rise {
    0% { transform: translate(-50%, 0) scale(0.6); opacity: 0; }
    20% { opacity: 1; }
    100% { transform: translate(-50%, -40px) scale(1); opacity: 0; }
  }

  /* reduced motion: no looping sprite animation, no drifting particles */
  @media (prefers-reduced-motion: reduce) {
    .pp-sprite { animation: none !important; }
    .pp-particle { animation-duration: 1ms; }
  }
`
