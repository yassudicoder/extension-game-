import { useCallback, useEffect, useState } from 'react'
import type { Animal, PetState } from '../shared/types'
import { MSG, sendMessage, type Message } from '../shared/messages'
import { loadState, onStateChanged } from '../shared/storage'
import { spriteSvg } from '../shared/sprites'
import { describeWellbeing } from '../shared/wellbeing'
import {
  ANIMALS,
  ANIMAL_LABELS,
  MIN_REMINDER_MIN,
  MAX_REMINDER_MIN,
  DEFAULT_SNOOZE_MIN,
} from '../shared/schema'

function usePetState() {
  const [state, setState] = useState<PetState | null>(null)

  useEffect(() => {
    // Read immediately for a snappy first paint, and ask the SW to integrate the
    // wellbeing math up to "now" so the popup shows a fresh value.
    void loadState(Date.now()).then((s) => setState((cur) => cur ?? s))
    void sendMessage({ type: MSG.GET_STATE }).then((r) => {
      if (r.state) setState(r.state)
    })
    const unsub = onStateChanged(setState)
    return unsub
  }, [])

  const act = useCallback(async (msg: Message) => {
    const r = await sendMessage(msg)
    if (r.state) setState(r.state)
  }, [])

  return { state, act }
}

export function App() {
  const { state, act } = usePetState()
  const [confirmReset, setConfirmReset] = useState(false)

  if (!state) {
    return (
      <div className="pp-popup pp-loading">
        <p>waking up your pet…</p>
      </div>
    )
  }

  const wins = state.todaysWins
  const asleep = state.sleepMode

  return (
    <div className="pp-popup">
      <header className="pp-hero">
        <div
          className="pp-preview"
          dangerouslySetInnerHTML={{ __html: spriteSvg(state.animal) }}
        />
        <div className="pp-hero-text">
          <h1>{ANIMAL_LABELS[state.animal]}</h1>
          <p className="pp-mood">{describeWellbeing(state)}</p>
        </div>
      </header>

      <section className="pp-card">
        <div className="pp-bar-row">
          <span className="pp-bar-label">wellbeing</span>
          <div className="pp-bar">
            <div className="pp-bar-fill" style={{ width: `${state.stats.wellbeing}%` }} />
          </div>
        </div>
      </section>

      <button className="pp-water" onClick={() => void act({ type: MSG.DRANK_WATER })}>
        <span className="pp-water-emoji">💧</span>
        I drank water
      </button>

      <section className="pp-card pp-wins">
        <h2>today’s little wins</h2>
        <ul>
          <li>
            <span>💧</span>
            {wins.water} {wins.water === 1 ? 'glass' : 'glasses'}
          </li>
          <li>
            <span>🌿</span>
            {wins.breaks} {wins.breaks === 1 ? 'break' : 'breaks'}
          </li>
          <li>
            <span>💛</span>
            {wins.pets} {wins.pets === 1 ? 'cuddle' : 'cuddles'}
          </li>
        </ul>
        <p className="pp-encourage">every little bit counts — no pressure 💛</p>
      </section>

      <section className="pp-card">
        <h2>your companion</h2>
        <div className="pp-animals">
          {ANIMALS.map((a: Animal) => (
            <button
              key={a}
              className={`pp-animal ${a === state.animal ? 'is-active' : ''}`}
              onClick={() => void act({ type: MSG.SET_ANIMAL, animal: a })}
              aria-pressed={a === state.animal}
            >
              <span
                className="pp-animal-sprite"
                dangerouslySetInnerHTML={{ __html: spriteSvg(a) }}
              />
              {ANIMAL_LABELS[a]}
            </button>
          ))}
        </div>

        <button
          className="pp-toggle-btn"
          onClick={() => void act({ type: MSG.TOGGLE_SLEEP, on: !asleep })}
        >
          {asleep ? '☀️ Good morning' : '🌙 Good night'}
        </button>
      </section>

      <section className="pp-card">
        <h2>gentle water reminders</h2>
        <label className="pp-switch">
          <input
            type="checkbox"
            checked={state.remindersEnabled}
            onChange={(e) =>
              void act({
                type: MSG.SET_REMINDER,
                intervalMin: state.reminderIntervalMin,
                enabled: e.target.checked,
              })
            }
          />
          <span>{state.remindersEnabled ? 'on' : 'off'}</span>
        </label>

        <div className={`pp-interval ${state.remindersEnabled ? '' : 'is-disabled'}`}>
          <input
            type="range"
            min={MIN_REMINDER_MIN}
            max={MAX_REMINDER_MIN}
            step={15}
            value={state.reminderIntervalMin}
            disabled={!state.remindersEnabled}
            onChange={(e) =>
              void act({
                type: MSG.SET_REMINDER,
                intervalMin: Number(e.target.value),
                enabled: state.remindersEnabled,
              })
            }
          />
          <span className="pp-interval-label">every {state.reminderIntervalMin} min</span>
        </div>

        {state.remindersEnabled && (
          <button
            className="pp-link-btn"
            onClick={() => void act({ type: MSG.SNOOZE_REMINDER, minutes: DEFAULT_SNOOZE_MIN })}
          >
            snooze for {DEFAULT_SNOOZE_MIN} min
          </button>
        )}
      </section>

      <section className="pp-card">
        <h2>display</h2>
        <label className="pp-switch">
          <input
            type="checkbox"
            checked={state.hidden}
            onChange={(e) => void act({ type: MSG.SET_HIDDEN, hidden: e.target.checked })}
          />
          <span>hide the pet on pages</span>
        </label>

        {!confirmReset ? (
          <button className="pp-link-btn pp-reset" onClick={() => setConfirmReset(true)}>
            reset everything
          </button>
        ) : (
          <div className="pp-confirm">
            <span>start fresh? your pet stays happy 💛</span>
            <div>
              <button
                className="pp-link-btn pp-reset"
                onClick={() => {
                  void act({ type: MSG.RESET })
                  setConfirmReset(false)
                }}
              >
                yes, reset
              </button>
              <button className="pp-link-btn" onClick={() => setConfirmReset(false)}>
                keep my pet
              </button>
            </div>
          </div>
        )}
      </section>

      <footer className="pp-footer">Pocket Pet · be kind to yourself today</footer>
    </div>
  )
}
