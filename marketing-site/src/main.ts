import './styles/tokens.css'
import './styles/base.css'
import './styles/hero.css'
import './styles/sections.css'
import { initHero } from './hero'
import { initSections } from './market'
import { decorateSections } from './critters'

initHero()
initSections()
decorateSections()

// The wooden header stays put as you scroll (persistent "Add to Chrome"); it just
// condenses once the hero has scrolled away.
const header = document.querySelector<HTMLElement>('.site-header')
const hero = document.querySelector('.hero')
if (header && hero && typeof IntersectionObserver !== 'undefined') {
  const io = new IntersectionObserver(
    ([e]) => header.classList.toggle('site-header--scrolled', !e.isIntersecting),
    { rootMargin: '-72px 0px 0px 0px' },
  )
  io.observe(hero)
}
