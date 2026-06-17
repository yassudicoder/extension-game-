// Scene tileset wiring for the user-supplied Sprout Lands pack (by Cup Nooble —
// free for commercial use, NOT redistributable, so the raw PNGs are git-ignored;
// see src/assets/scene/README.md). Vite imports the LOCAL files and bakes them into
// dist at build time. Coordinates below are in TILE units, read from the sheets.
//
// One pixel grid: TILE 16 × SCALE 6 = 96px, matching the pet (32px × 3 = 96).
import grass from '../assets/scene/Tilesets/Grass.png'
import fences from '../assets/scene/Tilesets/Fences.png'
import doors from '../assets/scene/Tilesets/Doors.png'
import walls from '../assets/scene/Tilesets/Wooden_House_Walls_Tilset.png'
import roof from '../assets/scene/Tilesets/Wooden_House_Roof_Tilset.png'
import biom from '../assets/scene/Objects/Basic_Grass_Biom_things.png'
import coop from '../assets/scene/Objects/Free_Chicken_House.png'
import furniture from '../assets/scene/Objects/Basic_Furniture.png'
import egg from '../assets/scene/Objects/Egg_item.png'
import milk from '../assets/scene/Objects/Simple_Milk_and_grass_item.png'
import chest from '../assets/scene/Objects/Chest.png'
import cow from '../assets/scene/Characters/Free Cow Sprites.png'
import chicken from '../assets/scene/Characters/Free Chicken Sprites.png'

export const TILE = 16
export const SCALE = 6

export interface TileDef {
  sheet: string
  sheetW: number
  sheetH: number
  x: number
  y: number
  w: number
  h: number
}

// curried definers per sheet (sheet pixel dims from reading the PNG IHDRs)
const mk =
  (sheet: string, sheetW: number, sheetH: number) =>
  (x: number, y: number, w = 1, h = 1): TileDef => ({ sheet, sheetW, sheetH, x, y, w, h })

const G = mk(grass, 176, 112)
const F = mk(fences, 64, 64)
const D = mk(doors, 16, 64)
const WL = mk(walls, 80, 48)
const RF = mk(roof, 112, 80)
const B = mk(biom, 144, 80)
const C = mk(coop, 48, 48)
const FU = mk(furniture, 144, 96)
const EG = mk(egg, 16, 16)
const MK = mk(milk, 64, 16)
const CHE = mk(chest, 240, 96)
const CW = mk(cow, 96, 64)
const CH = mk(chicken, 64, 32)

// TODO(coords): verified against the grid inspector, but the house composition
// (roof/wall/door rows) may need a refinement pass after the first screenshot.
export const TILES = {
  grass: G(1, 1), //   plain grass fill — tileable
  tree: B(1, 0, 2, 2), // leafy tree (canopy + trunk), 2×2
  bush: B(0, 3), //     small round bush
  rock: B(7, 1), //     small rock
  flower: B(6, 2), //   little flower
  fenceL: F(1, 3), //   fence left cap
  fenceMid: F(2, 3), // fence middle (repeat)
  fenceR: F(3, 3), //   fence right cap
  roofTop: RF(1, 0, 2, 1), // roof ridge
  roofMid: RF(1, 1, 2, 1), // roof body
  roofEave: RF(1, 2, 2, 1), // roof eave / trim
  wallMid: WL(1, 1, 2, 1), // brick wall
  wallBot: WL(1, 2, 2, 1), // wall base
  door: D(0, 2, 1, 2), //   door (1×2)
  coop: C(0, 0, 3, 3), //   complete 3×3 coop building (used as the hero homestead)

  // --- market items (cut from the Objects/Characters sheets) ---
  apple: B(2, 2),
  pumpkin: B(5, 2),
  sunflower: B(8, 2),
  itemBed: FU(0, 3, 1, 2), // green pet bed
  itemLamp: FU(3, 1), //     table lamp
  itemPainting: FU(0, 0), // framed picture
  itemPlant: FU(3, 0), //    potted plant
  itemRug: FU(0, 5), //      round rug
  itemClock: FU(5, 3), //    wall clock
  itemChest: CHE(0, 0, 2, 2), // treasure/supply chest
  itemEgg: EG(0, 0),
  itemMilk: MK(0, 0),
  cow: CW(0, 0, 2, 2), //    cow (upcoming pet)
  chicken: CH(0, 0, 1, 1), // chicken (upcoming pet)  TODO verify frame
} as const

export type TileName = keyof typeof TILES

/** Show a tile region in `el` via background-position (no crop; for single props). */
export function placeTile(el: HTMLElement, name: TileName, scale: number = SCALE): void {
  const t = TILES[name]
  const px = (n: number) => n * TILE * scale
  el.style.width = `${px(t.w)}px`
  el.style.height = `${px(t.h)}px`
  el.style.backgroundImage = `url(${t.sheet})`
  el.style.backgroundRepeat = 'no-repeat'
  el.style.backgroundSize = `${t.sheetW * scale}px ${t.sheetH * scale}px`
  el.style.backgroundPosition = `${-px(t.x)}px ${-px(t.y)}px`
  el.style.imageRendering = 'pixelated'
}

/** Crop one tile to a data URL for seamless tiling (the ground). */
export function cropTileURL(name: TileName, scale: number = SCALE): Promise<string> {
  const t = TILES[name]
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = t.w * TILE * scale
      c.height = t.h * TILE * scale
      const g = c.getContext('2d')
      if (!g) return reject(new Error('no 2d context'))
      g.imageSmoothingEnabled = false
      g.drawImage(img, t.x * TILE, t.y * TILE, t.w * TILE, t.h * TILE, 0, 0, c.width, c.height)
      resolve(c.toDataURL())
    }
    img.onerror = () => reject(new Error('sheet load failed'))
    img.src = t.sheet
  })
}
