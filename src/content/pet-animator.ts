import type { PetMood } from '../shared/types'

// Drives the pet's motion entirely with CSS transforms + requestAnimationFrame.
//  - The idle "bob" and blink are CSS keyframes (see styles.ts).
//  - Gentle horizontal "wandering" is a rAF loop that eases toward a new random
//    target every few seconds.
//  - The loop is PAUSED whenever the tab is hidden (Page Visibility API) to save
//    battery, and is skipped entirely when the user prefers reduced motion.

export interface Animator {
  start(): void
  stop(): void
  setMood(mood: PetMood): void
  playCelebrate(): void
  playDrink(): void
  playNudge(): void
  dispose(): void
}

const WANDER_RANGE = 16 // px of horizontal drift at most

export function createAnimator(
  petEl: HTMLElement,
  spriteEl: HTMLElement,
  fxEl: HTMLElement,
): Animator {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let raf = 0
  let running = false
  let mood: PetMood = 'content'

  let posX = 0
  let targetX = 0
  let retargetAt = 0
  let lastTs = 0

  function pickTarget(): void {
    const range = mood === 'sleeping' ? 0 : mood === 'happy' ? WANDER_RANGE : WANDER_RANGE * 0.6
    targetX = (Math.random() * 2 - 1) * range
  }

  function frame(ts: number): void {
    if (!running) return
    if (!lastTs) lastTs = ts
    const dt = Math.min(64, ts - lastTs)
    lastTs = ts
    if (ts >= retargetAt) {
      pickTarget()
      retargetAt = ts + 2200 + Math.random() * 2600
    }
    posX += (targetX - posX) * Math.min(1, dt / 600)
    petEl.style.transform = `translateX(${posX.toFixed(2)}px)`
    raf = requestAnimationFrame(frame)
  }

  function start(): void {
    if (prefersReduced) {
      petEl.style.transform = 'translateX(0)'
      return
    }
    if (running) return
    running = true
    lastTs = 0
    retargetAt = 0
    raf = requestAnimationFrame(frame)
  }

  function stop(): void {
    running = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  const onVisibility = (): void => {
    if (document.hidden) stop()
    else start()
  }
  document.addEventListener('visibilitychange', onVisibility)

  function setMood(next: PetMood): void {
    if (next === mood) return
    mood = next
    spriteEl.classList.remove('happy', 'content', 'sleepy', 'sleeping')
    spriteEl.classList.add(next)
  }

  function spawnParticles(glyphs: string[]): void {
    glyphs.forEach((g, i) => {
      const el = document.createElement('span')
      el.className = 'pp-particle'
      el.textContent = g
      el.style.animationDelay = `${i * 90}ms`
      el.style.left = `${42 + i * 8}%`
      fxEl.appendChild(el)
      window.setTimeout(() => el.remove(), 1100 + i * 90)
    })
  }

  function react(cls: string, glyphs: string[], ms: number): void {
    petEl.classList.add(cls)
    spawnParticles(glyphs)
    window.setTimeout(() => petEl.classList.remove(cls), ms)
  }

  function playCelebrate(): void {
    react('react-celebrate', ['❤', '✨', '❤'], 540)
  }
  function playDrink(): void {
    react('react-drink', ['💧'], 720)
  }
  function playNudge(): void {
    react('react-nudge', ['💧'], 920)
  }

  function dispose(): void {
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
  }

  spriteEl.classList.add(mood)

  return { start, stop, setMood, playCelebrate, playDrink, playNudge, dispose }
}
