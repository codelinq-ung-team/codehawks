// What Plaid balances fill in on the Basics form, and what disconnecting takes back.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyProfile } from '../src/domain/calculator.ts'
import type { FinancialSnapshot, Form } from '../src/lib/store.ts'
import { SAMPLE } from '../src/intake/plaid.ts'
import { applyPlaid, clearPlaid, debtFromPlaid, fillForm, plaidFill } from '../src/intake/plaidFill.ts'

const blank: Form = { age: null, income: null, marital: null, dependents: null, debt: null, coverage: null }

test('sums USD debts, the mortgage share and cash savings', () => {
  assert.deepEqual(plaidFill(SAMPLE), { debt: 229150, mortgage: 212000, otherDebts: 17150, savings: 22700, accounts: 5 })
})

test('ignores other currencies, missing and negative balances', () => {
  const snap: FinancialSnapshot = {
    environment: 'sandbox',
    accounts: [
      { category: 'debt', type: 'credit', subtype: 'credit card', currentBalance: 500, currency: 'EUR' },
      { category: 'debt', type: 'loan', subtype: 'auto', currentBalance: null, currency: 'USD' },
      { category: 'liquid_asset', type: 'depository', subtype: 'checking', currentBalance: -40, currency: 'USD' },
    ],
  }
  assert.deepEqual(plaidFill(snap), { debt: null, mortgage: 0, otherDebts: 0, savings: null, accounts: 3 })
  // No debt accounts is not the same as no debt: the question stays open.
  assert.equal(fillForm(blank, snap).debt, null)
})

test('fills only an empty debt answer and never overwrites a typed one', () => {
  assert.equal(fillForm(blank, SAMPLE).debt, 229150)
  assert.equal(fillForm({ ...blank, debt: 5000 }, SAMPLE).debt, 5000)
  assert.equal(fillForm({ ...blank, age: 35 }, SAMPLE).age, 35)
  assert.equal(fillForm(blank, null), blank)
})

test('proposes the debt split and savings with a plaid source', () => {
  const form = fillForm(blank, SAMPLE)
  const p = applyPlaid(emptyProfile(), form, SAMPLE)
  assert.deepEqual(p.mortgage, { status: 'proposed', value: 212000, source: 'plaid' })
  assert.deepEqual(p.otherDebts, { status: 'proposed', value: 17150, source: 'plaid' })
  assert.deepEqual(p.savings, { status: 'proposed', value: 22700, source: 'plaid' })
  assert.equal(p.income.status, 'empty')
})

test('an edited debt total means Abe asks for the split instead', () => {
  const form = { ...fillForm(blank, SAMPLE), debt: 300000 }
  assert.equal(debtFromPlaid(form, SAMPLE), false)
  const p = applyPlaid(emptyProfile(), form, SAMPLE)
  assert.equal(p.mortgage.status, 'empty')
  assert.equal(p.savings.status, 'proposed')
})

test('keeps answers the person confirmed', () => {
  const profile = { ...emptyProfile(), savings: { status: 'confirmed' as const, value: 1000 } }
  assert.deepEqual(applyPlaid(profile, blank, SAMPLE).savings, { status: 'confirmed', value: 1000 })
})

test('disconnecting clears only what Plaid filled', () => {
  const form = { ...fillForm(blank, SAMPLE), age: 35, income: 85000 }
  const profile = { ...applyPlaid(emptyProfile(), form, SAMPLE), income: { status: 'proposed' as const, value: 85000, source: 'form' as const } }
  const cleared = clearPlaid(profile, form, SAMPLE)
  assert.equal(cleared.form.debt, null)
  assert.equal(cleared.form.income, 85000)
  assert.equal(cleared.form.age, 35)
  assert.equal(cleared.profile.mortgage.status, 'empty')
  assert.equal(cleared.profile.savings.status, 'empty')
  assert.equal(cleared.profile.income.value, 85000)
})
