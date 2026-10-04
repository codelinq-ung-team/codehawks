// Session-only app state, in the same shape and under the same key as the 2D frontend
// (apps/web/src/lib/store.ts). Both apps are on one origin, so a tab that moves
// between them keeps its answers and its chat. This copy has no React: screens subscribe.
import { emptyProfile, type FieldId, type Field, type Profile } from '../domain/calculator.ts'

// Answers from the short form before the chat. null means not answered yet (never zero).
export type Marital = 'single' | 'married'
export type Form = { income: number | null; marital: Marital | null; dependents: number | null; debt: number | null; coverage: boolean | null }
export type Message = { role: 'bot' | 'user'; text: string; replies?: string[]; why?: boolean; done?: boolean }
export type AppState = {
  profile: Profile
  form: Form
  messages: Message[]
  pending: { value: number } | null
  started: boolean
  typing: boolean
}

const KEY = 'linclife:v1'
const listeners = new Set<() => void>()

function initial(): AppState {
  return {
    profile: emptyProfile(),
    form: { income: null, marital: null, dependents: null, debt: null, coverage: null },
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

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// Hash routes, same as the 2D frontend: #/, #/prepare, #/chat, #/review, #/results
export type Route = 'home' | 'prepare' | 'chat' | 'review' | 'results'
const ROUTES: Route[] = ['home', 'prepare', 'chat', 'review', 'results']

export function readRoute(): Route {
  const r = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0]
  return (ROUTES as string[]).includes(r) ? (r as Route) : 'home'
}

export function go(route: Route) { location.hash = route === 'home' ? '#/' : '#/' + route }

// A made-up household for demos (#/results?sample, or "See a sample family" on Home).
export function loadSample() {
  const v = (value: Field['value']): Field => ({ status: 'confirmed', value })
  setState({
    ...initial(),
    started: true,
    form: { income: 85000, marital: 'married', dependents: 2, debt: 280000, coverage: true },
    profile: {
      household: v('both'), youngestAge: v(4), income: v(85000), support: v(60000), years: v(18),
      mortgage: v(240000), otherDebts: v(40000), finalExpenses: v(12000), education: v(50000),
      existing: v(150000), savings: v(60000),
    },
  })
}
