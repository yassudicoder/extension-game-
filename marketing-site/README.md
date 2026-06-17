# Pocket Pet — marketing site

A standalone, static landing site for the Pocket Pet browser extension. Theme: a
cozy little farm where your pixel companion lives. Built with Vite (vanilla TS +
CSS), self-hosted fonts, and the extension's real pixel sprite sheets.

```bash
npm install
npm run dev        # local dev
npm run build      # type-check + static build to dist/
npm run preview    # preview the production build
```

Deploy `dist/` to Vercel, Netlify, or GitHub Pages (asset paths are relative, so a
project sub-path works without config).

## Status
- **Phase 1 (this):** design tokens + the living-farm **hero** (parallax diorama,
  day/night toggle, the real pixel pet wandering, ambient motion, reduced-motion safe).
- Phases 2–7 (meet the companion, the growing farm, earning Biscuits, seasons &
  festivals, trust + final CTA, footer) follow.

## Notes
- Fonts (`src/assets/fonts`) and sprite sheets (`src/assets/sprites`) are copied from
  the extension so the marketing pet matches the product exactly.
- All motion respects `prefers-reduced-motion`.
