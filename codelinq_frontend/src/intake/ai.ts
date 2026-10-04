// Asks the AI endpoint (POST /api/intake) to read one typed answer.
// Returns null when the AI can't be reached, so the chat falls back to the script.
import { known, type Reading } from './script.ts'
import type { FieldId } from '../domain/calculator.ts'
import type { AppState } from '../lib/store.ts'
import { assessmentContext } from './assessmentContext.ts'

const INTENTS = ['answer', 'unsure', 'skip', 'why', 'question', 'unclear']

// CloudFront signs requests to the backend and needs the hash of the exact body bytes.
async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function readAnswer(stepId: FieldId, asked: string, text: string, state: AppState): Promise<Reading | null> {
  try {
    const body = new TextEncoder().encode(JSON.stringify({
      step: stepId, question: asked.slice(0, 600), answer: text.slice(0, 1000), known: known(state),
      assessment_context: assessmentContext(state),
      ...(state.financialContextToken ? { plaid_context_token: state.financialContextToken } : {}),
    }))
    const response = await fetch('/api/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-amz-content-sha256': await sha256(body) },
      body,
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) return null
    const r = await response.json()
    if (!r || !INTENTS.includes(r.intent)) return null
    return {
      intent: r.intent,
      value: typeof r.value === 'number' ? r.value : null,
      household: typeof r.household === 'string' ? r.household : null,
      period: r.period === 'month' || r.period === 'year' ? r.period : null,
      extra: r.extra && typeof r.extra === 'object' ? r.extra : {},
      say: typeof r.say === 'string' ? r.say : '',
    }
  } catch {
    return null
  }
}
