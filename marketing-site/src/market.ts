// Builds §2 residents, the §3 home vignette, §5 seasons, and the §6 farm market.
// Pixel item sprites are stamped from the Sprout Lands pack; the cat/dog/bunny are
// the extension's own sprite sheets. Showcase only — no cart, no real money.
import { TILES, type TileName, placeTile } from './scene/tileset'
import { daypart, season } from './daypart'
import { reveal } from './reveal'
import catUrl from './assets/sprites/cat.png'
import dogUrl from './assets/sprites/dog.png'
import bunnyUrl from './assets/sprites/bunny.png'
import cornGrowUrl from './assets/scene/PixelFarmDEMO/GrowthProcess/Corn_growth.png'
import lettuceGrowUrl from './assets/scene/PixelFarmDEMO/GrowthProcess/Lettuce_growth.png'

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
  RESIDENTS.forEach((r, i) => {
    const card = el('div', 'resident')
    const art = el('div', 'resident__art')
    renderPet(art, r.key, 3, true)
    card.append(art, el('h3', undefined, r.name), el('span', 'trait', r.trait), el('p', undefined, r.blurb))
    row.appendChild(card)
    reveal(card, i)
  })
}

// ---- §3 home vignette ----
function abs(e: HTMLElement, css: Partial<CSSStyleDeclaration>): void {
  e.style.position = 'absolute'
  Object.assign(e.style, css)
}
function buildGrows(): void {
  const art = document.getElementById('grows-art')
  if (!art) return
  // A clean "home of your own" vignette: a tree, the coop, and (added in
  // decorateSections) a grazing cow — crops grow up in front of them. The dog +
  // bunny live in §2 and the hero, so they aren't repeated here.
  const tree = el('div')
  placeTile(tree, 'tree', 3)
  abs(tree, { left: '3%', bottom: '24%' })
  const coop = el('div')
  placeTile(coop, 'coop', 3)
  abs(coop, { right: '7%', bottom: '12%' })
  art.append(tree, coop)

  // A row of crops that comes up as the section scrolls into view: two real
  // sprite GROW-IN strips (corn, lettuce — frame 0 sprout -> frame 3 mature) plus
  // a few Sprout-Lands props that pop up with a scaleY sprout. Same reveal trigger.
  const cropEls: HTMLElement[] = []
  const placeAt = (c: HTMLElement, leftPct: number, i: number) => {
    abs(c, { left: `${leftPct}%`, bottom: '6%', zIndex: '2', transformOrigin: 'bottom center' })
    c.style.setProperty('--i', String(i))
    art.appendChild(c)
    cropEls.push(c)
  }
  placeAt(growStrip(cornGrowUrl, 4, 16, 16, 2), 23, 0)
  placeAt(growStrip(lettuceGrowUrl, 4, 16, 16, 2), 34, 1)
  const props: TileName[] = ['sunflower', 'flower', 'pumpkin']
  props.forEach((t, k) => {
    const c = el('div', 'crop')
    placeTile(c, t, 2)
    placeAt(c, 48 + k * 14, k + 2)
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

/** A crop that animates from sprout (frame 0) to mature (last frame) when `.grown`. */
function growStrip(url: string, frames: number, fw: number, fh: number, scale: number): HTMLElement {
  const c = el('div', 'grow-strip')
  Object.assign(c.style, {
    width: `${fw * scale}px`,
    height: `${fh * scale}px`,
    backgroundImage: `url(${url})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${fw * frames * scale}px ${fh * scale}px`,
    backgroundPositionX: '0px',
    imageRendering: 'pixelated',
  })
  c.style.setProperty('--grow-end', `${-(frames - 1) * fw * scale}px`)
  c.style.setProperty('--grow-steps', String(frames - 1))
  return c
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
const SEASONS: { tile: TileName; b: 'Spring' | 'Summer' | 'Autumn' | 'Winter'; s: string }[] = [
  { tile: 'flower', b: 'Spring', s: 'blossom & new sprouts' },
  { tile: 'sunflower', b: 'Summer', s: 'long, sunny days' },
  { tile: 'pumpkin', b: 'Autumn', s: 'the harvest festival' },
  { tile: 'itemLamp', b: 'Winter', s: 'snug lantern nights' },
]
function buildSeasons(): void {
  const strip = document.getElementById('season-strip')
  if (!strip) return
  const now = season() // highlight the visitor's real season, like the hero greeting
  SEASONS.forEach((s, i) => {
    const card = el('div', 'season')
    card.dataset.season = s.b.toLowerCase()
    const art = el('div', 'season__art')
    const sprite = el('div')
    placeTile(sprite, s.tile, fitScale(s.tile, 54))
    art.appendChild(sprite)
    const badge = el('span', 'season__now', 'now') // slot always reserved (no CLS)
    if (s.b === now) card.classList.add('is-now')
    card.append(badge, art, el('b', undefined, s.b), el('span', undefined, s.s))
    strip.appendChild(card)
    reveal(card, i)
  })
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
  const board = document.getElementById('market-board')
  const tabsEl = document.getElementById('market-tabs')
  const grid = document.getElementById('market-grid')
  if (!board || !tabsEl || !grid) return

  // a carved "Market" plaque echoing the hero sign + footer board
  board.insertBefore(el('div', 'market__plaque', 'Market'), tabsEl)

  ITEMS.forEach((item, i) => {
    const card = makeCard(item)
    grid.appendChild(card)
    reveal(card, i % 6)
  })
  grid.setAttribute('role', 'tabpanel')
  grid.setAttribute('aria-labelledby', 'market-tab-all') // labelled by the active tab

  // a polite live region announces the active filter + count to screen readers
  const live = el('p', 'sr-only')
  live.setAttribute('aria-live', 'polite')
  board.appendChild(live)

  const counts: Record<string, number> = {}
  for (const c of CATS) counts[c.id] = c.id === 'all' ? ITEMS.length : ITEMS.filter((it) => it.cat === c.id).length

  const tabs: HTMLButtonElement[] = []
  const setCat = (id: string, focusTab = false) => {
    tabs.forEach((t) => {
      const on = t.dataset.id === id
      t.setAttribute('aria-selected', String(on))
      t.tabIndex = on ? 0 : -1
      if (on && focusTab) t.focus()
    })
    grid.querySelectorAll<HTMLElement>('.card').forEach((c) => {
      c.style.display = id === 'all' || c.dataset.cat === id ? '' : 'none'
    })
    const label = CATS.find((c) => c.id === id)?.label ?? ''
    live.textContent = `${counts[id]} ${label} item${counts[id] === 1 ? '' : 's'}`
    grid.setAttribute('aria-labelledby', `market-tab-${id}`)
  }

  CATS.forEach((c, idx) => {
    const tab = el('button', 'tab', c.label) as HTMLButtonElement
    tab.type = 'button'
    tab.id = `market-tab-${c.id}`
    tab.dataset.id = c.id
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-controls', 'market-grid')
    tab.setAttribute('aria-selected', String(c.id === 'all'))
    tab.tabIndex = c.id === 'all' ? 0 : -1
    tab.addEventListener('click', () => setCat(c.id))
    tab.addEventListener('keydown', (e) => {
      let n = -1
      if (e.key === 'ArrowRight') n = (idx + 1) % CATS.length
      else if (e.key === 'ArrowLeft') n = (idx - 1 + CATS.length) % CATS.length
      else if (e.key === 'Home') n = 0
      else if (e.key === 'End') n = CATS.length - 1
      if (n >= 0) {
        e.preventDefault()
        setCat(CATS[n].id, true)
      }
    })
    tabs.push(tab)
    tabsEl.appendChild(tab)
  })

  // one-line reassurance that Biscuits aren't real money
  const legend = el('p', 'market__legend')
  legend.innerHTML =
    '<span class="coin" aria-hidden="true"></span>Prices are in Biscuits you earn in-app — nothing here costs real money.'
  tabsEl.insertAdjacentElement('afterend', legend)
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
