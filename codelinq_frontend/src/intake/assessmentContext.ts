import type { AppState } from '../lib/store.ts'

// Complete, privacy-limited session context sent with every Bedrock-backed intake turn.
// The Plaid snapshot itself travels separately as a server-signed token so the browser
// cannot alter balances before they reach the model.
export function assessmentContext(state: AppState) {
  return {
    form: { ...state.form },
    profile: Object.fromEntries(Object.entries(state.profile).map(([id, field]) => [id, {
      status: field.status,
      value: field.value,
      source: field.source ?? null,
    }])),
    conversation: state.messages.slice(-50).map(({ role, text }) => ({ role, text: text.slice(0, 1000) })),
    plaidConnected: Boolean(state.financialContextToken),
  }
}
