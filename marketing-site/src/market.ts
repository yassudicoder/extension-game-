// Builds §2 residents, the §3 home vignette, §5 seasons, and the §6 farm market.
// Pixel item sprites are stamped from the Sprout Lands pack; the cat/dog/bunny are
// the extension's own sprite sheets. Showcase only — no cart, no real money.
import { TILES, type TileName, placeTile } from './scene/tileset'
import { daypart } from './daypart'
import catUrl from './assets/sprites/cat.png'
import dogUrl from './assets/sprites/dog.png'
import bunnyUrl from './assets/sprites/bunny.png'

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const PET_URL: Record<string, string> = { cat: catUrl, dog: dogUrl, bunny: bunnyUrl }

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

/** Render one of the extension's animal sprite sheets (192×160, 6×5 of 32px). */
function renderPet(parent: HTMLElement, key: string, scale: number, animate: boolean): HTMLElement {
  const e = el('div')
  e.style.width = `${32 * scale}px`
  e.style.height = `${32 * scale}px`
  e.style.backgroundImage = `url(${PET_URL[key]})`
  e.style.backgroundRepeat = 'no-repeat'
  e.style.backgroundSize = `${192 * scale}px ${160 * scale}px`
  e.style.imageRendering = 'pixelated'
  if (animate && !reduced) {
    e.style.backgroundPositionX = '0px'
    e.style.backgroundPositionY = '0px' // idle row
    e.style.setProperty('--pp-x1', `${-4 * 32 * scale}px`)
    e.style.animation = `pp-cycle 1s steps(4) infinite`
  } else {
    e.style.backgroundPosition = '0 0'
  }
  parent.appendChild(e)
  return e
}

/** Display size (scale) so a tile lands near `target` px on its longest side. */
function fitScale(tile: TileName, target: number): number {
  const t = TILES[tile]
  return Math.max(2, Math.round(target / (Math.max(t.w, t.h) * 16)))
}

// ---- §2 residents ----
const RESIDENTS = [
  { key: 'cat', name: 'Pip', trait: 'curious', blurb: 'A grey tabby who pokes into every tab and naps in the warm spots.' },
  { key: 'dog', name: 'Biscuit', trait: 'loyal', blurb: 'A goofy pup who trots straight over the moment you take a break.' },
  { key: 'bunny', name: 'Clover', trait: 'gentle', blurb: 'A soft little rabbit, happiest when you stop to rest a while.' },
]
function buildResidents(): void {
  const row = document.getElementById('residents-row')
  if (!row) return
  for (const r of RESIDENTS) {
    const card = el('div', 'resident')
    const art = el('div', 'resident__art')
    renderPet(art, r.key, 3, true)
    card.append(art, el('h3', undefined, r.name), el('span', 'trait', r.trait), el('p', undefined, r.blurb))
    row.appendChild(card)
  }
}

// ---- §3 home vignette ----
function abs(e: HTMLElement, css: Partial<CSSStyleDeclaration>): void {
  e.style.position = 'absolute'
  Object.assign(e.style, css)
}
function buildGrows(): void {
  const art = document.getElementById('grows-art')
  if (!art) return
  const tree = el('div')
  placeTile(tree, 'tree', 3)
  abs(tree, { left: '3%', bottom: '26%' })
  const coop = el('div')
  placeTile(coop, 'coop', 3)
  abs(coop, { right: '8%', bottom: '12%' })
  const bed = el('div')
  placeTile(bed, 'itemBed', 3)
  abs(bed, { left: '16%', bottom: '12%' })
  art.append(tree, coop, bed)
  abs(renderPet(art, 'dog', 2, true), { left: '40%', bottom: '14%' })
  abs(renderPet(art, 'bunny', 2, true), { left: '56%', bottom: '12%' })

  // crops that sprout up from the soil as the section scrolls into view (idea #4)
  const crops: TileName[] = ['flower', 'bush', 'sunflower', 'flower', 'pumpkin']
  const cropEls = crops.map((t, i) => {
    const c = el('div', 'crop')
    placeTile(c, t, 2)
    abs(c, { left: `${9 + i * 17}%`, bottom: '6%', transformOrigin: 'bottom center' })
    c.style.setProperty('--i', String(i))
    art.appendChild(c)
    return c
  })
  if (reduced) {
    cropEls.forEach((c) => c.classList.add('grown'))
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            cropEls.forEach((c) => c.classList.add('grown'))
            io.disconnect()
          }
        }
      },
      { threshold: 0.4 },
    )
    io.observe(art)
  }
}

// §4 — replace the system emoji (they read "AI-generated") with on-palette icons.
function buildLoopIcons(): void {
  const icons = [
    ...document.querySelectorAll<HTMLElement>('.section--biscuits .habit[data-note] .habit__i'),
  ]
  if (icons.length < 4) return
  const shapes = ['px-drop', 'px-leaf', 'px-moon', 'px-heart'] // water · break · sleep · pet
  icons.forEach((i, k) => {
    i.textContent = ''
    i.classList.add(shapes[k])
  })
}

// §4 — Pip comments on the gentle loop; chips swap his note on hover/focus.
function buildPipNote(): void {
  const note = document.getElementById('pip-note')
  if (!note) return
  const def = note.textContent ?? ''
  document.querySelectorAll<HTMLElement>('.section--biscuits .habit[data-note]').forEach((chip) => {
    const show = () => (note.textContent = chip.dataset.note ?? def)
    const reset = () => (note.textContent = def)
    chip.addEventListener('mouseenter', show)
    chip.addEventListener('focus', show)
    chip.addEventListener('mouseleave', reset)
    chip.addEventListener('blur', reset)
  })
}

// §4 — the "earn" coin flips once when the loop scrolls into view.
function buildCoinReveal(): void {
  if (reduced) return
  const coin = document.querySelector<HTMLElement>('.habit--earn .coin')
  if (!coin) return
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          coin.classList.add('coin--flip')
          io.disconnect()
        }
      }
    },
    { threshold: 0.6 },
  )
  io.observe(coin)
}

// footer sign-off uses the same time word as the hero greeting (one breath of day).
function setFooterWhen(): void {
  const w = document.getElementById('footer-when')
  if (w) w.textContent = daypart().signoff
}

// ---- §5 seasons ----
const SEASONS: { tile: TileName; b: string; s: string }[] = [
  { tile: 'flower', b: 'Spring', s: 'blossom & new sprouts' },
  { tile: 'sunflower', b: 'Summer', s: 'long, sunny days' },
  { tile: 'pumpkin', b: 'Autumn', s: 'the harvest festival' },
  { tile: 'itemLamp', b: 'Winter', s: 'snug lantern nights' },
]
function buildSeasons(): void {
  const strip = document.getElementById('season-strip')
  if (!strip) return
  for (const s of SEASONS) {
    const card = el('div', 'season')
    const art = el('div', 'season__art')
    const sprite = el('div')
    placeTile(sprite, s.tile, fitScale(s.tile, 54))
    art.appendChild(sprite)
    card.append(art, el('b', undefined, s.b), el('span', undefined, s.s))
    strip.appendChild(card)
  }
}

// ---- §6 the market ----
type Cat = 'pets' | 'houses' | 'food' | 'toys' | 'decor' | 'seasonal'
interface MItem {
  name: string
  flavor: string
  price: number
  cat: Cat
  tile?: TileName
  pet?: string
  tag?: 'new' | 'festival' | 'rare' | 'soon'
  lg?: boolean
}

const CATS: { id: 'all' | Cat; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pets', label: 'Pets' },
  { id: 'houses', label: 'Pet houses' },
  { id: 'food', label: 'Food & treats' },
  { id: 'toys', label: 'Toys' },
  { id: 'decor', label: 'Decor' },
  { id: 'seasonal', label: 'Seasonal' },
]

// NOTE: Sprout Lands has no dedicated "toy" sprites, so the Toys items reuse the
// nearest cohesive props (a flower, a hay bush) as clearly-labelled stand-ins.
const ITEMS: MItem[] = [
  { name: 'Pip the cat', flavor: 'Curious grey tabby — yours from day one.', price: 0, cat: 'pets', pet: 'cat', lg: true },
  { name: 'Biscuit the dog', flavor: 'Loyal, goofy, always up for a break.', price: 0, cat: 'pets', pet: 'dog' },
  { name: 'Clover the bunny', flavor: 'Soft and gentle; loves a good rest.', price: 0, cat: 'pets', pet: 'bunny' },
  { name: 'Clucky the chicken', flavor: 'Pecks happily about the yard.', price: 120, cat: 'pets', tile: 'chicken', tag: 'soon' },
  { name: 'Maisie the cow', flavor: 'Moos hello on slow afternoons.', price: 300, cat: 'pets', tile: 'cow', tag: 'soon', lg: true },

  { name: 'Cozy coop', flavor: 'A little wooden home for the flock.', price: 180, cat: 'houses', tile: 'coop', lg: true },
  { name: 'Soft pet bed', flavor: 'For well-earned afternoon naps.', price: 60, cat: 'houses', tile: 'itemBed' },

  { name: 'Crisp apple', flavor: 'A sweet, healthy snack.', price: 8, cat: 'food', tile: 'apple' },
  { name: 'Fresh milk', flavor: 'Straight from the farm.', price: 12, cat: 'food', tile: 'itemMilk' },
  { name: 'New-laid egg', flavor: 'Still warm from the coop.', price: 10, cat: 'food', tile: 'itemEgg', tag: 'new' },
  { name: 'Harvest pumpkin', flavor: 'A hearty autumn treat.', price: 20, cat: 'food', tile: 'pumpkin' },

  { name: 'Chase-the-flower', flavor: 'A blossom on a string.', price: 14, cat: 'toys', tile: 'flower' },
  { name: 'Hay tumble', flavor: 'Bounce, burrow, repeat.', price: 16, cat: 'toys', tile: 'bush' },

  { name: 'Potted plant', flavor: 'A spot of green indoors.', price: 25, cat: 'decor', tile: 'itemPlant' },
  { name: 'Warm lamp', flavor: 'A soft glow for the evenings.', price: 30, cat: 'decor', tile: 'itemLamp' },
  { name: 'Framed view', flavor: 'A little window on the world.', price: 22, cat: 'decor', tile: 'itemPainting' },
  { name: 'Round rug', flavor: 'Ties the whole room together.', price: 28, cat: 'decor', tile: 'itemRug' },
  { name: 'Wall clock', flavor: 'Tick-tock — time for a break.', price: 34, cat: 'decor', tile: 'itemClock' },
  { name: 'Keepsake chest', flavor: 'Stash your festival finds.', price: 45, cat: 'decor', tile: 'itemChest', tag: 'rare' },

  { name: 'Bright sunflower', flavor: 'A summer-fair favourite.', price: 18, cat: 'seasonal', tile: 'sunflower', tag: 'festival' },
  { name: 'Festival lantern', flavor: 'Lights the autumn night fair.', price: 40, cat: 'seasonal', tile: 'itemLamp', tag: 'festival' },
]

function makeCard(item: MItem): HTMLElement {
  const card = el('div', 'card' + (item.lg ? ' card--lg' : ''))
  card.dataset.cat = item.cat
  const art = el('div', 'card__art')
  if (item.pet) {
    renderPet(art, item.pet, item.lg ? 3 : 2, false)
  } else if (item.tile) {
    const sprite = el('div')
    placeTile(sprite, item.tile, fitScale(item.tile, item.lg ? 116 : 76))
    art.appendChild(sprite)
  }
  const foot = el('div', 'card__foot')
  const price = el('span', 'price')
  price.innerHTML = `<span class="coin"></span>${item.price > 0 ? item.price : 'free'}`
  foot.appendChild(price)
  if (item.tag) foot.appendChild(el('span', `tag tag--${item.tag}`, item.tag === 'soon' ? 'soon' : item.tag))
  card.append(art, el('div', 'card__name', item.name), el('div', 'card__flavor', item.flavor), foot)
  return card
}

function buildMarket(): void {
  const tabsEl = document.getElementById('market-tabs')
  const grid = document.getElementById('market-grid')
  if (!tabsEl || !grid) return

  for (const item of ITEMS) grid.appendChild(makeCard(item))

  const setCat = (id: string) => {
    tabsEl.querySelectorAll<HTMLElement>('.tab').forEach((t) =>
      t.setAttribute('aria-selected', String(t.dataset.id === id)),
    )
    grid.querySelectorAll<HTMLElement>('.card').forEach((c) => {
      c.style.display = id === 'all' || c.dataset.cat === id ? '' : 'none'
    })
  }
  for (const c of CATS) {
    const tab = el('button', 'tab', c.label) as HTMLButtonElement
    tab.type = 'button'
    tab.dataset.id = c.id
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', String(c.id === 'all'))
    tab.addEventListener('click', () => setCat(c.id))
    tabsEl.appendChild(tab)
  }
}

export function initSections(): void {
  buildResidents()
  buildGrows()
  buildSeasons()
  buildMarket()
  buildLoopIcons()
  buildPipNote()
  buildCoinReveal()
  setFooterWhen()
}
