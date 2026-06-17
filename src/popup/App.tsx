import { useCallback, useEffect, useRef, useState } from 'react'
import type { Animal, PetState } from '../shared/types'
import { MSG, sendMessage, type Message } from '../shared/messages'
import { loadState, onStateChanged } from '../shared/storage'
import { SPRITES, mountSprite, setSpriteState, setStaticFrame } from '../shared/sprites'
import { describeWellbeing } from '../shared/wellbeing'
import {
  ANIMALS,
  ANIMAL_LABELS,
  DEFAULT_REMINDER_MIN,
  MIN_REMINDER_MIN,
  MAX_REMINDER_MIN,
  DEFAULT_BREAK_MIN,
  MIN_BREAK_MIN,
  MAX_BREAK_MIN,
} from '../shared/schema'

// Cosy display-only names (NOT persisted — purely cosmetic, per the spec).
const PET_NAMES: Record<Animal, string> = { cat: 'Pip', dog: 'Biscuit', bunny: 'Clover' }

const HERO_SCALE = 3 // 32px frame -> 96px hero
const RESIDENT_SCALE = 1 // 32px thumbnail

/** A static idle-frame thumbnail of an animal for the resident picker. */
function ResidentSprite({ animal }: { animal: Animal }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    mountSprite(el, animal, RESIDENT_SCALE)
    setStaticFrame(el, animal, 'idle', 0, RESIDENT_SCALE)
  }, [animal])
  return <span ref={ref} className="mini pp-pixel" />
}

function usePetState() {
  const [state, setState] = useState<PetState | null>(null)

  useEffect(() => {
    void loadState(Date.now()).then((s) => setState((cur) => cur ?? s))
    void sendMessage({ type: MSG.GET_STATE }).then((r) => {
      if (r.state) setState(r.state)
    })
    return onStateChanged(setState)
  }, [])

  const act = useCallback(async (msg: Message) => {
    const r = await sendMessage(msg)
    if (r.state) setState(r.state)
  }, [])

  return { state, act }
}

/** Re-trigger a one-shot CSS animation class (reflow trick); auto-clears. */
function retrigger(el: HTMLElement | null, cls: string, ms: number): void {
  if (!el) return
  el.classList.remove(cls)
  void el.offsetWidth
  el.classList.add(cls)
  window.setTimeout(() => el.classList.remove(cls), ms)
}

function ComfyHeart({ value }: { value: number }) {
  const f = Math.max(0, Math.min(100, value))
  const y = 29 - (29 * f) / 100
  const h = (29 * f) / 100
  const heart = 'M16 28 C3 18 1 10 6 5 C10 1 15 3 16 7 C17 3 22 1 26 5 C31 10 29 18 16 28Z'
  return (
    <span className="heart" title={`comfort ${Math.round(f)}%`}>
      <svg viewBox="0 0 32 29" role="img" aria-label={`comfort ${Math.round(f)} percent`}>
        <defs>
          <clipPath id="pp-heart-clip">
            <rect x="0" y={y} width="32" height={h} />
          </clipPath>
        </defs>
        <path d={heart} fill="#f0e0d6" />
        <path d={heart} fill="#f1a28c" clipPath="url(#pp-heart-clip)" />
      </svg>
    </span>
  )
}

export function App() {
  const { state, act } = usePetState()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [reminderDraft, setReminderDraft] = useState(DEFAULT_REMINDER_MIN)
  const [breakDraft, setBreakDraft] = useState(DEFAULT_BREAK_MIN)

  const heroRef = useRef<HTMLDivElement>(null)
  const rippleRef = useRef<HTMLSpanElement>(null)
  const dropRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (state) setReminderDraft(state.reminderIntervalMin)
  }, [state?.reminderIntervalMin])

  useEffect(() => {
    if (state) setBreakDraft(state.breakIntervalMin)
  }, [state?.breakIntervalMin])

  // Drive the pixel hero: mount the sheet and reflect idle/sleep; play() on demand.
  useEffect(() => {
    const el = heroRef.current
    if (!el || !state) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    mountSprite(el, state.animal, HERO_SCALE)
    const base = state.sleepMode ? 'sleep' : 'idle'
    if (reduced) setStaticFrame(el, state.animal, base, 0, HERO_SCALE)
    else setSpriteState(el, state.animal, base, HERO_SCALE)
  }, [state?.animal, state?.sleepMode])

  if (!state) {
    return <div className="popup loading">waking up your pet…</div>
  }

  const animal = state.animal
  const asleep = state.sleepMode

  const playHero = () => {
    const el = heroRef.current
    if (!el || state.sleepMode) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setSpriteState(el, state.animal, 'play', HERO_SCALE)
    const d = SPRITES[state.animal].states.play
    window.setTimeout(() => {
      const e = heroRef.current
      if (e) setSpriteState(e, state.animal, state.sleepMode ? 'sleep' : 'idle', HERO_SCALE)
    }, (d.frames / d.fps) * 1000)
  }
  const petIt = () => {
    void act({ type: MSG.PET_CLICKED })
    playHero()
  }
  const drinkWater = () => {
    void act({ type: MSG.DRANK_WATER })
    playHero()
    retrigger(rippleRef.current, 'go', 700)
    retrigger(dropRef.current, 'go', 900)
  }
  const feed = () => {
    void act({ type: MSG.FED })
    playHero()
  }
  const commitInterval = () => {
    void act({ type: MSG.SET_REMINDER, intervalMin: reminderDraft, enabled: state.remindersEnabled })
  }
  const commitBreak = () => {
    void act({ type: MSG.SET_BREAK, intervalMin: breakDraft, enabled: state.breakRemindersEnabled })
  }

  return (
    <div className={`popup ${asleep ? 'night' : ''} ${drawerOpen ? 'open' : ''}`}>
      {/* title */}
      <div className="nameplate">
        <div>
          <h1>{PET_NAMES[animal]}</h1>
          <div className="mood">{describeWellbeing(state)}</div>
        </div>
        <div className="comfort">
          <span className="label">comfy</span>
          <ComfyHeart value={state.stats.wellbeing} />
        </div>
      </div>

      {/* the room */}
      <div className="room">
        <div className="wall" />

        <div className="window">
          <div className="cloud" style={{ top: 42, left: 18, width: 34 }} />
          <div className="cloud" style={{ top: 74, left: 78, width: 26 }} />
          <span className="star" style={{ top: 30, left: 34 }} />
          <span className="star" style={{ top: 54, left: 104 }} />
          <span className="star" style={{ top: 92, left: 46 }} />
          <span className="star" style={{ top: 108, left: 96 }} />
          <div className="sun" />
          <div className="moon" />
        </div>

        <div className="plant">
          <span className="vine" />
          <span className="leaf" style={{ top: 6, left: 8 }} />
          <span className="leaf" style={{ top: 16, left: 24, transform: 'scaleX(-1)' }} />
          <span className="leaf" style={{ top: 28, left: 6 }} />
          <div className="pot" />
        </div>

        <div className="lamp">
          <div className="cord" />
          <div className="dome" />
        </div>
        <div className="glow" />

        <div className="baseboard" />
        <div className="floor" />

        <div className="stage">
          <div className="rug" />

          <button className="pet" aria-label={`Pet ${PET_NAMES[animal]}`} onClick={petIt}>
            <div ref={heroRef} className="pixel-pet pp-pixel" />
          </button>

          <span ref={rippleRef} className="ripple" />
          <span ref={dropRef} className="drop" aria-hidden="true">
            💧
          </span>

          <button
            className="obj bowl"
            aria-label="Fill the water bowl — I had a glass"
            onClick={drinkWater}
          >
            <svg width="48" height="34" viewBox="0 0 48 34" aria-hidden="true">
              <ellipse cx="24" cy="24" rx="22" ry="9" fill="#cdd7e2" />
              <ellipse cx="24" cy="22" rx="22" ry="9" fill="#e7edf3" />
              <ellipse cx="24" cy="22" rx="16" ry="6" fill="#8fd0ee" />
              <ellipse cx="20" cy="20.5" rx="5" ry="1.6" fill="#bfe7f7" />
            </svg>
            <span className="cap">water</span>
          </button>

          <button className="obj dish" aria-label="Feed your pet a snack" onClick={feed}>
            <svg width="44" height="32" viewBox="0 0 44 32" aria-hidden="true">
              <ellipse cx="22" cy="24" rx="20" ry="8" fill="#cdd7e2" />
              <ellipse cx="22" cy="22" rx="20" ry="8" fill="#e7edf3" />
              <ellipse cx="22" cy="21" rx="13" ry="5" fill="#cba06a" />
              <circle cx="16" cy="20" r="2" fill="#9c6b3f" />
              <circle cx="23" cy="21" r="2" fill="#9c6b3f" />
              <circle cx="28" cy="19" r="1.6" fill="#9c6b3f" />
            </svg>
            <span className="cap">snack</span>
          </button>

          <button
            className="obj bed"
            aria-label={asleep ? 'Wake your pet up' : 'Tuck your pet in for the night'}
            aria-pressed={asleep}
            onClick={() => void act({ type: MSG.TOGGLE_SLEEP, on: !asleep })}
          >
            <svg width="58" height="36" viewBox="0 0 58 36" aria-hidden="true">
              <ellipse cx="29" cy="27" rx="27" ry="8" fill="#caa06a" />
              <path d="M5 27 Q4 13 29 12 Q54 13 53 27 Z" fill="#e7c79c" />
              <ellipse cx="29" cy="22" rx="20" ry="6.5" fill="#f6ead2" />
              <path d="M38 18 q8 -1 9 6" stroke="#cf9e6c" strokeWidth="3" fill="none" strokeLinecap="round" />
            </svg>
            <span className="cap">{asleep ? 'good morning' : 'good night'}</span>
          </button>
        </div>
      </div>

      {/* today's little wins */}
      <div className="shelf">
        <h2>today’s little wins</h2>
        <div className="tokens">
          <span className="token">
            <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
              <path d="M7 0 C7 0 13 8 13 12 A6 6 0 1 1 1 12 C1 8 7 0 7 0Z" fill="#7fc6e6" />
            </svg>
            {state.todaysWins.water}
          </span>
          <span className="token">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#cba06a" />
              <circle cx="6" cy="6" r="1" fill="#7e5a34" />
              <circle cx="10.5" cy="7" r="1" fill="#7e5a34" />
              <circle cx="7" cy="10.5" r="1" fill="#7e5a34" />
              <circle cx="11" cy="11" r="1" fill="#7e5a34" />
            </svg>
            {state.todaysWins.snacks}
          </span>
          <span className="token">
            <svg width="17" height="16" viewBox="0 0 17 16" aria-hidden="true">
              <path d="M2 14 C2 5 9 1 15 1 C15 9 9 14 2 14Z" fill="#9cae6e" />
              <path d="M3 13 C6 9 10 6 13 4" stroke="#7d9056" strokeWidth="1.2" fill="none" />
            </svg>
            {state.todaysWins.breaks}
          </span>
          <span className="token">
            <svg width="17" height="15" viewBox="0 0 17 15" aria-hidden="true">
              <path
                d="M8.5 14 C2 9 1 5 3.5 2.5 C5.5 .5 8 2 8.5 4 C9 2 11.5 .5 13.5 2.5 C16 5 15 9 8.5 14Z"
                fill="#f1a28c"
              />
            </svg>
            {state.todaysWins.pets}
          </span>
        </div>
      </div>

      {/* residents */}
      <div className="residents">
        {ANIMALS.map((a) => (
          <button
            key={a}
            className={`frame ${a === animal ? 'is-home' : ''}`}
            aria-pressed={a === animal}
            aria-label={`Choose ${ANIMAL_LABELS[a]}`}
            onClick={() => void act({ type: MSG.SET_ANIMAL, animal: a })}
          >
            <ResidentSprite animal={a} />
            {ANIMAL_LABELS[a]}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <button
          className="summon"
          aria-pressed={!state.hidden}
          onClick={() => void act({ type: MSG.SET_HIDDEN, hidden: !state.hidden })}
        >
          {state.hidden ? `☀️ Send ${PET_NAMES[animal]} outside` : `🏠 Bring ${PET_NAMES[animal]} inside`}
        </button>
        <button
          className="gear"
          aria-label="Settings"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((o) => !o)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm9 4a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.4-2.6H9.6L9.2 4a7 7 0 00-1.7 1l-2.4-1-2 3.4L3.1 11a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.6h4.8l.4-2.6a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6c.06-.33.1-.66.1-1z" />
          </svg>
        </button>
      </div>

      {/* settings drawer */}
      <div className="drawer">
        <div className="grab" />
        <h3>settings</h3>

        <div className={`range-row ${state.remindersEnabled ? '' : 'is-off'}`}>
          <div className="top">
            <span>gentle water reminders</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={state.remindersEnabled}
                aria-label="Toggle water reminders"
                onChange={(e) =>
                  void act({
                    type: MSG.SET_REMINDER,
                    intervalMin: state.reminderIntervalMin,
                    enabled: e.target.checked,
                  })
                }
              />
              <span className="track" />
              <span className="knob" />
            </label>
          </div>
          <input
            type="range"
            min={MIN_REMINDER_MIN}
            max={MAX_REMINDER_MIN}
            step={15}
            value={reminderDraft}
            disabled={!state.remindersEnabled}
            aria-label="Reminder interval in minutes"
            onChange={(e) => setReminderDraft(Number(e.target.value))}
            onPointerUp={commitInterval}
            onKeyUp={commitInterval}
            onBlur={commitInterval}
          />
          <div className="range-note">
            every {reminderDraft} min · never while you’re away or asleep
          </div>
        </div>

        <div className={`range-row ${state.breakRemindersEnabled ? '' : 'is-off'}`}>
          <div className="top">
            <span>break breather</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={state.breakRemindersEnabled}
                aria-label="Toggle break breather"
                onChange={(e) =>
                  void act({
                    type: MSG.SET_BREAK,
                    intervalMin: state.breakIntervalMin,
                    enabled: e.target.checked,
                  })
                }
              />
              <span className="track" />
              <span className="knob" />
            </label>
          </div>
          <input
            type="range"
            min={MIN_BREAK_MIN}
            max={MAX_BREAK_MIN}
            step={5}
            value={breakDraft}
            disabled={!state.breakRemindersEnabled}
            aria-label="Break interval in minutes"
            onChange={(e) => setBreakDraft(Number(e.target.value))}
            onPointerUp={commitBreak}
            onKeyUp={commitBreak}
            onBlur={commitBreak}
          />
          <div className="range-note">every {breakDraft} min · a nudge to stretch, sip &amp; snack</div>
        </div>

        <div className="opt">
          <span>hide your pet on pages</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={state.hidden}
              aria-label="Hide the pet on pages"
              onChange={(e) => void act({ type: MSG.SET_HIDDEN, hidden: e.target.checked })}
            />
            <span className="track" />
            <span className="knob" />
          </label>
        </div>

        {!confirmReset ? (
          <button className="reset" onClick={() => setConfirmReset(true)}>
            start fresh — {PET_NAMES[animal]} stays happy 💛
          </button>
        ) : (
          <div className="reset-confirm">
            <span>start fresh? {PET_NAMES[animal]} stays happy 💛</span>
            <div className="reset-actions">
              <button
                className="reset reset-yes"
                onClick={() => {
                  void act({ type: MSG.RESET })
                  setConfirmReset(false)
                }}
              >
                yes, reset
              </button>
              <button className="reset reset-keep" onClick={() => setConfirmReset(false)}>
                keep my pet
              </button>
            </div>
          </div>
        )}
        <div className="footer">Pocket Pet · be kind to yourself today</div>
      </div>
    </div>
  )
}
