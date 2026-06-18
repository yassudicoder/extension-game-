// One shared IntersectionObserver for "rise + fade in on scroll" entrances, with an
// optional --i stagger. Reduced-motion shows everything immediately. Elements are only
// given the hidden pre-state when JS registers them, so there's never hidden content
// for users without scripting (the whole page is JS-rendered anyway).
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const io =
  reduce || typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver(
        (entries, obs) => {
          for (const en of entries) {
            if (en.isIntersecting) {
              en.target.classList.add('is-in')
              obs.unobserve(en.target)
            }
          }
        },
        { threshold: 0.14, rootMargin: '0px 0px -7% 0px' },
      )

/** Register an element to fade/rise in when it scrolls into view. */
export function reveal(elx: HTMLElement, index = 0): void {
  elx.classList.add('reveal')
  if (index) elx.style.setProperty('--i', String(index))
  if (!io) {
    elx.classList.add('is-in')
    return
  }
  io.observe(elx)
}

/** Reveal a group of elements with a left-to-right stagger. */
export function revealGroup(els: Iterable<HTMLElement>): void {
  let i = 0
  for (const e of els) reveal(e, i++)
}
