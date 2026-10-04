// Pairing this browser with the Quest app (POST and GET /api/pair, see apps/backend/pairing.py).
// The site saves the Basics answers and shows the pairing id as a QR code; the headset reads it,
// has the conversation, and saves what Abe learned back for the site to pick up.
import { FIELDS, emptyProfile, missingRequired, type Profile } from '../domain/calculator.ts'
import type { Form, Route } from '../lib/store.ts'
import { sha256 } from './ai.ts'

export type Pairing = { id: string; code: string; codeUntil: number }
// done: the conversation is over. handoff: the wearer has seen their results in the headset and
// is coming back to this browser.
export type Shared = { status: 'waiting' | 'joined' | 'done' | 'handoff'; form: Form; profile: Profile }

// What the QR code holds. Capitals and digits only, so the code stays small and easy to read.
export const QR_PREFIX = 'LINCLIFE:'
export const qrText = (id: string) => QR_PREFIX + id

export async function createPairing(form: Form, profile: Profile): Promise<Pairing | null> {
  try {
    const body = new TextEncoder().encode(JSON.stringify({ form, profile }))
    const response = await fetch('/api/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-amz-content-sha256': await sha256(body) },
      body,
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) return null
    const r = await response.json()
    if (typeof r?.id !== 'string' || typeof r.code !== 'string') return null
    return { id: r.id, code: r.code, codeUntil: Date.now() + (Number(r.codeSeconds) || 0) * 1000 }
  } catch {
    return null
  }
}

// 'gone' when the pairing has expired; null when the server can't be reached right now.
export async function readPairing(id: string): Promise<Shared | 'gone' | null> {
  try {
    const response = await fetch('/api/pair/' + encodeURIComponent(id), { signal: AbortSignal.timeout(8000) })
    if (response.status === 404) return 'gone'
    if (!response.ok) return null
    return shared(await response.json())
  } catch {
    return null
  }
}

// The server has already checked every value; this only guards the shape the screens rely on.
export function shared(r: unknown): Shared | null {
  const o = r as { status?: unknown; form?: unknown; profile?: unknown } | null
  if (!o || typeof o.form !== 'object' || !o.form || typeof o.profile !== 'object' || !o.profile) return null
  if (o.status !== 'waiting' && o.status !== 'joined' && o.status !== 'done' && o.status !== 'handoff') return null
  const profile = emptyProfile()
  for (const f of FIELDS) {
    const field = (o.profile as Partial<Profile>)[f.id]
    if (field && typeof field.status === 'string') profile[f.id] = field
  }
  return { status: o.status, form: o.form as Form, profile }
}

// Where someone coming back from the headset lands: on their results when they confirmed their
// answers there, and otherwise on Review to confirm them here.
export function landing(profile: Profile): Route {
  return missingRequired(profile).length === 0 && FIELDS.every((f) => f.role !== 'required' || profile[f.id].status === 'confirmed') ? 'results' : 'review'
}
