import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyProfile } from '../src/domain/calculator.ts'
import type { FinancialSnapshot } from '../src/lib/store.ts'
import { applyPlaidDebts, clearPlaidFields, plaidDebtBreakdown } from '../src/intake/plaidProfile.ts'

function snapshot(): FinancialSnapshot {
  return {
    version: 1,
    source: 'plaid_accounts_get',
    environment: 'sandbox',
    asOf: '2026-10-04T00:00:00Z',
    accounts: [
      { category: 'debt', type: 'loan', subtype: 'mortgage', currentBalance: 150000, availableBalance: null, limit: null, currency: 'USD' },
      { category: 'debt', type: 'credit', subtype: 'credit card', currentBalance: 3706, availableBalance: 294, limit: 4000, currency: 'USD' },
      { category: 'debt', type: 'loan', subtype: 'student', currentBalance: 10000, availableBalance: null, limit: null, currency: 'USD' },
      { category: 'investment_asset', type: 'investment', subtype: 'brokerage', currentBalance: 23953, availableBalance: null, limit: null, currency: 'USD' },
    ],
    totalsByCurrency: { USD: { liquidAssets: 0, investmentAssets: 23953, debtBalances: 163706 } },
    limitations: [],
  }
}

test('Plaid debt is split into mortgage and other debts for the intake profile', () => {
  assert.deepEqual(plaidDebtBreakdown(snapshot()), { mortgage: 150000, otherDebts: 13706 })
  const profile = applyPlaidDebts(emptyProfile(), snapshot())
  assert.deepEqual(profile.mortgage, { status: 'proposed', value: 150000, source: 'plaid' })
  assert.deepEqual(profile.otherDebts, { status: 'proposed', value: 13706, source: 'plaid' })
})

test('Plaid debt does not overwrite an answer the user already confirmed', () => {
  const profile = emptyProfile()
  profile.mortgage = { status: 'confirmed', value: 125000 }
  const imported = applyPlaidDebts(profile, snapshot())
  assert.deepEqual(imported.mortgage, { status: 'confirmed', value: 125000 })
  assert.equal(imported.otherDebts.value, 13706)
})

test('disconnecting Plaid removes only fields imported from Plaid', () => {
  const profile = applyPlaidDebts(emptyProfile(), snapshot())
  profile.income = { status: 'confirmed', value: 85000 }
  const cleared = clearPlaidFields(profile)
  assert.deepEqual(cleared.mortgage, { status: 'empty', value: null })
  assert.deepEqual(cleared.otherDebts, { status: 'empty', value: null })
  assert.deepEqual(cleared.income, { status: 'confirmed', value: 85000 })
})
