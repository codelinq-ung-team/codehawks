import type { Profile } from '../domain/calculator.ts'
import type { FinancialSnapshot } from '../lib/store.ts'

export type PlaidDebtBreakdown = { mortgage: number; otherDebts: number }

export function plaidDebtBreakdown(snapshot: FinancialSnapshot | null): PlaidDebtBreakdown | null {
  if (!snapshot) return null
  const debts = snapshot.accounts.filter((account) => (
    account.category === 'debt'
    && account.currency === 'USD'
    && account.currentBalance != null
    && Number.isFinite(account.currentBalance)
    && account.currentBalance > 0
  ))
  if (!debts.length) return null

  const mortgage = debts
    .filter((account) => account.subtype === 'mortgage')
    .reduce((total, account) => total + Number(account.currentBalance), 0)
  const total = debts.reduce((sum, account) => sum + Number(account.currentBalance), 0)
  return { mortgage: Math.round(mortgage), otherDebts: Math.round(total - mortgage) }
}

export function applyPlaidDebts(profile: Profile, snapshot: FinancialSnapshot | null): Profile {
  const debts = plaidDebtBreakdown(snapshot)
  if (!debts) return profile
  let next = profile
  for (const id of ['mortgage', 'otherDebts'] as const) {
    const current = profile[id]
    if (current.source === 'plaid' && current.status === 'proposed' && current.value === debts[id]) continue
    if (current.status === 'empty' || (current.source === 'plaid' && current.status === 'proposed')) {
      if (next === profile) next = { ...profile }
      next[id] = { status: 'proposed', value: debts[id], source: 'plaid' }
    }
  }
  return next
}

export function clearPlaidFields(profile: Profile): Profile {
  return Object.fromEntries(Object.entries(profile).map(([id, field]) => [
    id,
    field.source === 'plaid' ? { status: 'empty', value: null } : field,
  ])) as Profile
}
