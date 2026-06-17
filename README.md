# Pocket Pet 🐾

A tiny, **always-forgiving** browser companion. A small animated pet lives as an
overlay on your pages and gently mirrors your healthy habits — water, breaks, and a
day/night rhythm. Click it to pet it. It never dies, never gets sick, never scolds.
On good days it thrives; on slow days it stays soft and encouraging. Inspired by Finch.

## Quick start

```bash
npm install
npm run build        # generates icons, type-checks, and builds to dist/
```

Then load it in Chrome:

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. **Load unpacked** → select the `dist/` folder

Dev mode with HMR: `npm run dev` (then load the generated `dist/` once; @crxjs reloads on change).
Run the wellbeing unit tests: `npm test`.

## How it’s built (Manifest V3)

| Area | Notes |
| --- | --- |
| **Service worker** (`src/background`) | Ephemeral by design. Owns `chrome.alarms` + `chrome.idle` + the wellbeing tick. It is the **single writer** to storage (a mutex serialises read-modify-write so concurrent messages can’t clobber state). |
| **Scheduling** | `chrome.alarms` only — never `setTimeout`/`setInterval` (those don’t survive suspension). One 5-min tick alarm drives the wellbeing refresh, the “sleep until morning” auto-wake, and the water-reminder check. |
| **State** | `chrome.storage.local` is the single source of truth (never `localStorage`). UI reads it and listens to `chrome.storage.onChanged`. Schema + migration in `src/shared/schema.ts`. |
| **Activity** | `chrome.idle` (`active`/`idle`/`locked`). Idle/locked = the pet rests; a manual “good night” sleeps it until morning. |
| **On-page pet** (`src/content`) | Injected into an **open Shadow DOM** so page CSS and pet CSS are fully isolated. A fixed, full-viewport wrapper is `pointer-events:none`; only the sprite is `pointer-events:auto`, so the page stays clickable. Drag to move, hide from the popup. |
| **Animation** | CSS transforms + `requestAnimationFrame`, paused when the tab is hidden (Page Visibility API), and disabled under `prefers-reduced-motion`. |
| **Assets** | Sprites are inline SVG (in `src/shared/sprites.ts`) — no remote code, and no image assets to expose. (@crxjs does add a `web_accessible_resources` entry for the content script's *own* JS chunks; that's its module-loader strategy, not asset loading.) |
| **Permissions** | `storage`, `alarms`, `idle`, and `host_permissions: <all_urls>`. (Broad host perms reduce install conversion — see the note in `manifest.config.ts`.) |

## Wellbeing is forgiving *by construction*

All the math lives in pure, unit-tested functions (`src/shared/wellbeing.ts`):

- Wellbeing is **always clamped to `[30, 100]`** — there is no zero / distress state.
- It **rises easily** (fast approach when you care for it) and **decays slowly and
  gently** (a small fraction per hour).
- Decay is computed from **elapsed timestamps**, not tick counts, so a suspended or
  killed service worker never changes the outcome.
- Resting is always **good** and never penalised; the lowest mood is “sleepy”.

See `src/shared/wellbeing.test.ts` for the guarantees encoded as tests.

## Project layout

```
manifest.config.ts        MV3 manifest (typed, via @crxjs)
vite.config.ts            minimal Vite + @crxjs + React build
index.html                popup entry
scripts/gen-icons.mjs     dependency-free PNG icon generator
src/
  background/             service worker, alarms, idle
  content/                Shadow DOM overlay, sprite animator, drag
  popup/                  React dashboard + settings
  shared/                 types, schema, storage, messages, sprites, wellbeing (pure)
```
