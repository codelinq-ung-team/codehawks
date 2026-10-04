import type { FinancialSnapshot } from '../lib/store.ts'

type LinkTokenResponse = { link_token: string; expiration: string }
type ExchangeResponse = {
  connected: boolean
  financialSnapshot: FinancialSnapshot
  financialContextToken: string
}

export class PlaidApiError extends Error {}

async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function postJson<T>(path: string, value: unknown): Promise<T> {
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
    throw new PlaidApiError('The Plaid service could not be reached. Make sure the backend is running.')
  }
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const message = result && typeof result.error === 'string' ? result.error : 'The Plaid request failed.'
    throw new PlaidApiError(message)
  }
  return result as T
}

export async function requestLinkToken() {
  const result = await postJson<LinkTokenResponse>('/api/plaid/link-token', {})
  if (!result || typeof result.link_token !== 'string' || !result.link_token) {
    throw new PlaidApiError('The backend returned an invalid Plaid Link token.')
  }
  return result.link_token
}

export async function exchangePublicToken(publicToken: string) {
  const result = await postJson<ExchangeResponse>('/api/plaid/exchange', { public_token: publicToken })
  if (!result?.connected || typeof result.financialContextToken !== 'string' ||
      !result.financialSnapshot || !Array.isArray(result.financialSnapshot.accounts)) {
    throw new PlaidApiError('The backend returned an invalid financial snapshot.')
  }
  return result
}
