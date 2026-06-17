// Scene tileset system. The actual pixel pack is USER-SUPPLIED — drop it into
// src/assets/scene/ (see the README there). Until `sheet` is set, nothing renders
// from here, so there are no broken assets in the meantime. Every coordinate below
// is a TODO to be filled by inspecting the dropped pack.

export interface TileRect {
  x: number
  y: number
  w: number
  h: number
}

export interface TilesetManifest {
  /** Imported URL of the sheet PNG, e.g. `import sheet from '../assets/scene/pack.png'`. */
  sheet: string | null
  /** Full sheet dimensions in source px (needed for background-size). */
  sheetW: number
  sheetH: number
  /** Native tile size of the pack in px (commonly 16 or 32). */
  nativeTile: number
  /** Device px per source px — set so one pixel matches the pet (pet = 32px × 3). */
  scale: number
  /** Named tiles / props / market items → source rect in the sheet. */
  tiles: Record<string, TileRect>
}

// TODO(pack): once the pack lands in src/assets/scene/:
//   1. `import sheet from '../assets/scene/<file>.png'` and set `sheet`, sheetW/H.
//   2. set nativeTile + scale (16px native → 6×, 32px → 3×, to match the pet).
//   3. fill `tiles` by reading the sheet. Names the hero + market expect:
//      scene:  barn, silo, coop, tree, bush, fence, fence-post, ground-grass,
//              ground-dirt, path, cloud, window-lit, lantern, lantern-lit, flower
//      market: item-doghouse, item-bed, item-ball, item-yarn, item-bowl, item-food,
//              item-hay, item-lantern, item-plant, item-fence, item-festival-1 ...
export const SCENE: TilesetManifest = {
  sheet: null,
  sheetW: 0,
  sheetH: 0,
  nativeTile: 16,
  scale: 6, // recompute once the pack's native tile size is known
  tiles: {},
}

/**
 * Stamp a named tile onto an element via background-position (pixel-perfect).
 * Returns false (and does nothing) until the pack is wired, so callers never
 * produce a broken image.
 */
export function placeTile(el: HTMLElement, name: string, m: TilesetManifest = SCENE): boolean {
  const t = m.tiles[name]
  if (!m.sheet || !t) return false
  el.style.imageRendering = 'pixelated'
  el.style.backgroundImage = `url(${m.sheet})`
  el.style.backgroundRepeat = 'no-repeat'
  el.style.backgroundSize = `${m.sheetW * m.scale}px ${m.sheetH * m.scale}px`
  el.style.backgroundPosition = `${-t.x * m.scale}px ${-t.y * m.scale}px`
  el.style.width = `${t.w * m.scale}px`
  el.style.height = `${t.h * m.scale}px`
  return true
}
