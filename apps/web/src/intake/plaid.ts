// Connecting accounts through Plaid Sandbox (POST /api/plaid/*, see apps/backend/plaid.py).
// Bank logins stay inside Plaid Link; this app gets only a redacted balance snapshot.
import type { FinancialSnapshot } from '../lib/store.ts'
import { sha256 } from './ai.ts'

export class PlaidApiError extends Error {}

async function post(path: string, value: unknown): Promise<unknown> {
  const body = new TextEncoder().encode(JSON.stringify(value))
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-amz-content-sha256': await sha256(body) },
      body,
      signal: AbortSignal.timeout(30000),
    })
  } catch {
    throw new PlaidApiError('Plaid couldn’t be reached right now.')
  }
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof result?.error === 'string' ? result.error : 'The Plaid request failed.'
    throw new PlaidApiError(message)
  }
  return result
}

export type PlaidLinkSession = { linkToken: string; userId: string }

export async function requestLinkToken(): Promise<PlaidLinkSession> {
  const r = await post('/api/plaid/link-token', {}) as { link_token?: unknown; user_id?: unknown } | null
  if (typeof r?.link_token !== 'string' || !r.link_token || typeof r.user_id !== 'string' || !r.user_id) {
    throw new PlaidApiError('Plaid returned an invalid Link session.')
  }
  return { linkToken: r.link_token, userId: r.user_id }
}

export async function exchangePublicToken(publicToken: string, userId: string): Promise<FinancialSnapshot> {
  const r = await post('/api/plaid/exchange', { public_token: publicToken, user_id: userId }) as { financialSnapshot?: FinancialSnapshot } | null
  const income = r?.financialSnapshot?.annualIncome
  if (!r?.financialSnapshot || !Array.isArray(r.financialSnapshot.accounts)
    || !(income === null || (typeof income === 'number' && Number.isFinite(income) && income >= 0))) {
    throw new PlaidApiError('Plaid returned an invalid snapshot.')
  }
  return r.financialSnapshot
}

// Made-up accounts for demos when Plaid can't be reached or has no keys. Always labeled "Sample" on screen.
export const SAMPLE: FinancialSnapshot = {
  environment: 'sample',
  annualIncome: 85000,
  accounts: [
    { category: 'liquid_asset', type: 'depository', subtype: 'checking', currentBalance: 4200, currency: 'USD' },
    { category: 'liquid_asset', type: 'depository', subtype: 'savings', currentBalance: 18500, currency: 'USD' },
    { category: 'debt', type: 'credit', subtype: 'credit card', currentBalance: 2350, currency: 'USD' },
    { category: 'debt', type: 'loan', subtype: 'mortgage', currentBalance: 212000, currency: 'USD' },
    { category: 'debt', type: 'loan', subtype: 'student', currentBalance: 14800, currency: 'USD' },
  ],
}
