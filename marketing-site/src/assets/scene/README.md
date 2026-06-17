# Scene tileset — drop your pixel pack here

The cozy-farm pixel tileset is **user-supplied** (per design plan v2). Drop your
chosen pack's sheet PNG(s) into this folder and I'll wire the whole scene + market
to it on one shared pixel grid.

## What to drop
- The tileset **sheet PNG(s)** — buildings / terrain / objects. If the pack splits
  them (e.g. `tiles.png` + `objects.png`), drop all of them; keep original filenames.
- If the pack ships **night** or **seasonal** variant sheets, drop those too.

## What I need from you (3 things)
1. **Pack name + author + license.** It must be OK to bundle in this repo/site —
   CC0 or "free to use" (attribution is fine; I'll add credits in the footer +
   a `CREDITS.md`). Packs that forbid redistributing the raw assets won't work for a
   public repo, so pick a permissive one.
2. **Native tile size** in px (commonly 16 or 32).
3. **Which sheet holds what** (buildings vs terrain vs props), if there are several.

## What happens next
I inspect the sheet, set `scale` in `src/scene/tileset.ts` so one source pixel
matches the pet (pet = 32px × 3), fill the tile coordinates, then assemble the hero
homestead and cut the marketplace item sprites — all `image-rendering: pixelated`
on one grid.

Permissive options to consider (verify the license yourself): **Sprout Lands**
(Cup Nooble), **Cozy Farm**, **Tiny Ranch**, and similar farming tilesets on itch.io.
