// What a Plaid balance snapshot can fill in. Pure functions, no UI.
// Balances answer the Basics debt question, split the debt into mortgage and other debts,
// and suggest savings. Every value is 'proposed': the person checks it before any math.
// Plaid balances say nothing about income, family or insurance, so those stay as questions.
import type { Profile } from '../domain/calculator.ts'
import type { FinancialSnapshot, Form } from '../lib/store.ts'

export type PlaidFill = { debt: number | null; mortgage: number; otherDebts: number; savings: number | null; accounts: number }

export function plaidFill(snapshot: FinancialSnapshot | null | undefined): PlaidFill | null {
  if (!snapshot) return null
  const usd = snapshot.accounts.filter((a) => a.currency === 'USD' && a.currentBalance != null && Number.isFinite(a.currentBalance) && a.currentBalance > 0)
  const sum = (list: typeof usd) => Math.round(list.reduce((total, a) => total + Number(a.currentBalance), 0))
  const debts = usd.filter((a) => a.category === 'debt')
  const cash = usd.filter((a) => a.category === 'liquid_asset')
  const mortgage = sum(debts.filter((a) => a.subtype === 'mortgage'))
  // No debt accounts doesn't mean no debt (it may be at another bank), so leave the question open.
  const debt = debts.length ? sum(debts) : null
  return { debt, mortgage, otherDebts: (debt ?? 0) - mortgage, savings: cash.length ? sum(cash) : null, accounts: snapshot.accounts.length }
}

// Basics answers Plaid can fill. Only empty answers, so it never overwrites what the person typed.
export function fillForm(form: Form, snapshot: FinancialSnapshot | null | undefined): Form {
  const fill = plaidFill(snapshot)
  if (!fill || fill.debt == null || form.debt != null) return form
  return { ...form, debt: fill.debt }
}

// True while the Basics debt answer is still the one Plaid filled in.
export function debtFromPlaid(form: Form, snapshot: FinancialSnapshot | null | undefined): boolean {
  const fill = plaidFill(snapshot)
  return fill?.debt != null && form.debt === fill.debt
}

// After the Basics form: proposes the debt split and savings so Abe can skip those questions.
// The split is used only if the debt answer still matches Plaid; an edited total means Abe asks.
export function applyPlaid(profile: Profile, form: Form, snapshot: FinancialSnapshot | null | undefined): Profile {
  const fill = plaidFill(snapshot)
  if (!fill) return profile
  const p = { ...profile }
  const set = (id: 'mortgage' | 'otherDebts' | 'savings', value: number) => {
    const f = p[id]
    if (f.status === 'empty' || (f.status === 'proposed' && f.source != null)) p[id] = { status: 'proposed', value, source: 'plaid' }
  }
  if (debtFromPlaid(form, snapshot)) { set('mortgage', fill.mortgage); set('otherDebts', fill.otherDebts) }
  if (fill.savings != null) set('savings', fill.savings)
  return p
}

// Disconnecting removes everything Plaid filled in, and nothing the person answered.
export function clearPlaid(profile: Profile, form: Form, snapshot: FinancialSnapshot | null | undefined): { profile: Profile; form: Form } {
  const p = Object.fromEntries(Object.entries(profile).map(([id, f]) => [id, f.source === 'plaid' ? { status: 'empty', value: null } : f])) as Profile
  return { profile: p, form: debtFromPlaid(form, snapshot) ? { ...form, debt: null } : form }
}
