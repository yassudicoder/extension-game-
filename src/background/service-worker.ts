import type { PetState } from '../shared/types'
import { MSG, type Message, type MsgResponse } from '../shared/messages'
import { loadState, saveState } from '../shared/storage'
import { defaultState } from '../shared/schema'
import * as wb from '../shared/wellbeing'
import { ALARM_TICK, ensureAlarms } from './alarms'
import { registerIdle } from './idle'

// =============================================================================
// Service worker — the brain. It is EPHEMERAL (Chrome can kill it at any time), so:
//   - every listener is registered synchronously at the top level (below),
//   - no state is held in memory between events; we always read from storage,
//   - wellbeing is derived from timestamps, so a cold start loses nothing,
//   - scheduling uses chrome.alarms only (never setTimeout/setInterval).
//
// It is also the SINGLE WRITER to chrome.storage.local. All mutations funnel through
// mutate(), which serialises read-modify-write so concurrent messages can't clobber
// each other (lost-update safety within a worker lifetime).
// =============================================================================

const now = (): number => Date.now()

// ---- single-writer mutex ----
let chain: Promise<unknown> = Promise.resolve()

function mutate(apply: (state: PetState, t: number) => PetState): Promise<PetState> {
  const run = chain.then(async () => {
    const t = now()
    const state = await loadState(t)
    const next = apply(state, t)
    await saveState(next)
    return next
  })
  // keep the chain alive even if one step rejects
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

// ---- soft, non-aggressive toolbar cue ----
async function setNudgeBadge(on: boolean): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#7FB5FF' })
    await chrome.action.setBadgeText({ text: on ? '•' : '' })
  } catch {
    // action API may be briefly unavailable; the on-page nudge is the primary cue.
  }
}

// ---- re-inject the content overlay into already-open tabs ----
// Declared content scripts only auto-inject on the NEXT navigation, so after an
// install / update / unpacked-reload the pet is missing from tabs that are already
// open until they're refreshed. mountPet() is idempotent, so re-injecting is safe.
async function injectContentScript(tabId: number): Promise<void> {
  const files = chrome.runtime.getManifest().content_scripts?.[0]?.js
  if (!files || files.length === 0) return
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files })
  } catch {
    // restricted page (chrome://, the Web Store, PDF viewer …) or already present.
  }
}
async function injectIntoOpenTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({})
    for (const tab of tabs) {
      if (tab.id != null && tab.url && /^https?:/i.test(tab.url)) await injectContentScript(tab.id)
    }
  } catch {
    /* no-op */
  }
}
async function injectIntoActiveTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id != null && tab.url && /^https?:/i.test(tab.url)) await injectContentScript(tab.id)
  } catch {
    /* no-op */
  }
}

// ---- message handling (popup / content → SW) ----
function handle(msg: Message): Promise<PetState> {
  switch (msg.type) {
    case MSG.DRANK_WATER:
      void setNudgeBadge(false)
      return mutate((s, t) => wb.applyWater(s, t))
    case MSG.FED:
      void setNudgeBadge(false)
      return mutate((s, t) => wb.applyFeed(s, t))
    case MSG.PET_CLICKED:
      return mutate((s, t) => wb.applyPet(s, t))
    case MSG.TOGGLE_SLEEP:
      return mutate((s, t) => wb.applySleep(s, t, msg.on))
    case MSG.SET_ANIMAL:
      return mutate((s, t) => ({ ...wb.applyTick(s, t), animal: msg.animal }))
    case MSG.SET_REMINDER:
      return mutate((s, t) => wb.applyReminderSettings(s, t, msg.intervalMin, msg.enabled))
    case MSG.SET_BREAK:
      return mutate((s, t) => wb.applyBreakSettings(s, t, msg.intervalMin, msg.enabled))
    case MSG.SNOOZE_REMINDER:
      void setNudgeBadge(false)
      return mutate((s, t) => wb.applySnooze(s, t, msg.minutes))
    case MSG.SET_POSITION:
      return mutate((s, t) => ({ ...wb.applyTick(s, t), position: msg.position }))
    case MSG.SET_HIDDEN:
      if (!msg.hidden) void injectIntoActiveTab() // summoning: make sure the pet is present
      return mutate((s, t) => ({ ...wb.applyTick(s, t), hidden: msg.hidden }))
    case MSG.RESET:
      void setNudgeBadge(false)
      return mutate((_s, t) => defaultState(t))
    case MSG.GET_STATE:
      return mutate((s, t) => wb.applyTick(s, t))
    default:
      return mutate((s, t) => wb.applyTick(s, t))
  }
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  handle(msg)
    .then((state) => sendResponse({ ok: true, state } satisfies MsgResponse))
    .catch((e) => sendResponse({ ok: false, error: String(e) } satisfies MsgResponse))
  return true // keep the channel open for the async response
})

// ---- the periodic tick: recompute, auto-wake, maybe nudge ----
async function onTick(): Promise<void> {
  let didNudge = false
  await mutate((s, t) => {
    let n = wb.applyTick(s, t)
    n = wb.maybeWake(n, t)
    n = wb.applyTimeTrickle(n, t) // capped passive biscuit trickle while active+awake
    if (wb.reminderDue(n, t)) {
      didNudge = true
      n = { ...n, lastReminderAt: t, lastNudgeAt: t, snoozeUntil: null }
    } else if (wb.breakDue(n, t)) {
      // at most one nudge per tick; water takes priority over the break breather
      didNudge = true
      n = { ...n, lastBreakAt: t, lastNudgeAt: t }
    }
    return n
  })
  if (didNudge) await setNudgeBadge(true)
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_TICK) void onTick()
})

// ---- idle → activity ----
registerIdle((activity) => {
  void mutate((s, t) => wb.applyActivity(s, t, activity))
})

// ---- lifecycle: (re)create alarms; ensure state exists; clear stale badge ----
chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    await mutate((s, t) => wb.applyTick(s, t)) // materialise / migrate state
    await ensureAlarms()
    await setNudgeBadge(false)
    await injectIntoOpenTabs() // so the pet appears without a manual page refresh
  })()
})

chrome.runtime.onStartup.addListener(() => {
  void (async () => {
    await ensureAlarms() // alarms persist, but re-assert after a browser restart
    await mutate((s, t) => {
      // a restart often means time has passed; integrate and re-check wake state
      return wb.maybeWake(wb.applyTick(s, t), t)
    })
    await setNudgeBadge(false)
    await injectIntoOpenTabs()
  })()
})
