// What a Plaid financial snapshot can fill in. Pure functions, no UI. Bank Income estimates
// yearly income; balances answer debt, split it, and suggest savings. The person checks it all.
import type { Profile } from '../domain/calculator.ts'
import type { FinancialSnapshot, Form } from '../lib/store.ts'

export type PlaidFill = { income: number | null; debt: number | null; mortgage: number; otherDebts: number; savings: number | null; accounts: number }

export function plaidFill(snapshot: FinancialSnapshot | null | undefined): PlaidFill | null {
  if (!snapshot) return null
  const usd = snapshot.accounts.filter((a) => a.currency === 'USD' && a.currentBalance != null && Number.isFinite(a.currentBalance) && a.currentBalance > 0)
  const sum = (list: typeof usd) => Math.round(list.reduce((total, a) => total + Number(a.currentBalance), 0))
  const debts = usd.filter((a) => a.category === 'debt')
  const cash = usd.filter((a) => a.category === 'liquid_asset')
  const mortgage = sum(debts.filter((a) => a.subtype === 'mortgage'))
  // No debt accounts doesn't mean no debt (it may be at another bank), so leave the question open.
  const debt = debts.length ? sum(debts) : null
  const income = typeof snapshot.annualIncome === 'number' && Number.isFinite(snapshot.annualIncome)
    && snapshot.annualIncome >= 0 && snapshot.annualIncome <= 100_000_000 ? Math.round(snapshot.annualIncome) : null
  return { income, debt, mortgage, otherDebts: (debt ?? 0) - mortgage, savings: cash.length ? sum(cash) : null, accounts: snapshot.accounts.length }
}

// Basics answers Plaid can fill. Only empty answers, so it never overwrites what the person typed.
export function fillForm(form: Form, snapshot: FinancialSnapshot | null | undefined): Form {
  const fill = plaidFill(snapshot)
  if (!fill) return form
  return {
    ...form,
    income: form.income == null && fill.income != null ? fill.income : form.income,
    debt: form.debt == null && fill.debt != null ? fill.debt : form.debt,
  }
}

export function incomeFromPlaid(form: Form, snapshot: FinancialSnapshot | null | undefined): boolean {
  const fill = plaidFill(snapshot)
  return fill?.income != null && form.income === fill.income
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
  const set = (id: 'income' | 'mortgage' | 'otherDebts' | 'savings', value: number) => {
    const f = p[id]
    if (f.status === 'empty' || (f.status === 'proposed' && f.source != null)) p[id] = { status: 'proposed', value, source: 'plaid' }
  }
  if (incomeFromPlaid(form, snapshot)) set('income', fill.income!)
  if (debtFromPlaid(form, snapshot)) { set('mortgage', fill.mortgage); set('otherDebts', fill.otherDebts) }
  if (fill.savings != null) set('savings', fill.savings)
  return p
}

// Disconnecting removes everything Plaid filled in, and nothing the person answered.
export function clearPlaid(profile: Profile, form: Form, snapshot: FinancialSnapshot | null | undefined): { profile: Profile; form: Form } {
  const p = Object.fromEntries(Object.entries(profile).map(([id, f]) => [id, f.source === 'plaid' ? { status: 'empty', value: null } : f])) as Profile
  return {
    profile: p,
    form: {
      ...form,
      income: incomeFromPlaid(form, snapshot) ? null : form.income,
      debt: debtFromPlaid(form, snapshot) ? null : form.debt,
    },
  }
}
