// Session-only app state: no accounts, cleared when the tab closes or on Start Over.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { emptyProfile, type FieldId, type Field, type Profile } from '../domain/calculator.ts'

export type Flags = { partner: boolean | null; kids: boolean | null; mortgage: boolean | null; coverage: boolean | null }
export type Message = { role: 'bot' | 'user'; text: string; replies?: string[]; why?: boolean; done?: boolean }
export type AppState = {
  profile: Profile
  flags: Flags
  messages: Message[]
  pending: { value: number } | null
  started: boolean
  typing: boolean
}

const KEY = 'linqlife:v1'
const listeners = new Set<() => void>()

function initial(): AppState {
  return {
    profile: emptyProfile(),
    flags: { partner: null, kids: null, mortgage: null, coverage: null },
    messages: [],
    pending: null,
    started: false,
    typing: false,
  }
}

function load(): AppState {
  try {
    const raw = sessionStorage.getItem(KEY)
    // "typing" is transient; a reload mid-message shouldn't leave it on.
    if (raw) return { ...initial(), ...JSON.parse(raw), typing: false }
  } catch { /* storage blocked: start fresh */ }
  return initial()
}

let state = load()
const emit = () => listeners.forEach((l) => l())

export const getState = () => state

export function setState(update: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  state = { ...state, ...(typeof update === 'function' ? update(state) : update) }
  try { sessionStorage.setItem(KEY, JSON.stringify(state)) } catch { /* keep in memory only */ }
  emit()
}

export function setField(id: FieldId, field: Field) {
  setState((s) => ({ profile: { ...s.profile, [id]: field } }))
}

export function resetState() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
  state = initial()
  emit()
}

export function useStore() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => state,
  )
}

// Hash routes: #/, #/prepare, #/chat, #/review, #/results
export type Route = 'home' | 'prepare' | 'chat' | 'review' | 'results'
const ROUTES: Route[] = ['home', 'prepare', 'chat', 'review', 'results']

function readRoute(): Route {
  const r = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0]
  return (ROUTES as string[]).includes(r) ? (r as Route) : 'home'
}

export function useRoute() {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const on = () => { setRoute(readRoute()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function go(route: Route) { location.hash = route === 'home' ? '#/' : '#/' + route }
