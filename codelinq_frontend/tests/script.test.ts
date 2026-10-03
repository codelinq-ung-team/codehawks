// The canonical questionnaire excludes mortgages from its debt answer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyProfile } from '../src/domain/calculator.ts'
import type { AppState, Form } from '../src/lib/store.ts'
import { applyForm, nextStep, respond } from '../src/intake/script.ts'

function state(form: Partial<Form> = {}): AppState {
  const s: AppState = {
    assessment: null,
    profile: emptyProfile(),
    form: { income: null, marital: null, dependents: null, debt: null, coverage: null, ...form },
    messages: [], pending: null, started: true, typing: false,
  }
  return { ...s, ...applyForm(s) }
}

test('form answers prefill the profile as proposed, not confirmed', () => {
  const s = state({ income: 75000, marital: 'married', dependents: 0, debt: 0, coverage: false })
  assert.deepEqual(s.profile.income, { status: 'proposed', value: 75000, source: 'form' })
  assert.equal(s.profile.household.value, 'partner')
  assert.equal(s.profile.mortgage.status, 'empty')
  assert.equal(s.profile.otherDebts.value, 0)
  assert.equal(s.profile.existing.value, 0)
})

test('skipped form answers stay empty, never zero', () => {
  const s = state({ income: null, debt: null, coverage: true })
  assert.equal(s.profile.income.status, 'empty')
  assert.equal(s.profile.mortgage.status, 'empty')
  assert.equal(s.profile.existing.status, 'empty')
  assert.equal(nextStep(s), 'household')
})

test('with dependents, Abe still asks who they are', () => {
  const s = state({ marital: 'single', dependents: 2 })
  assert.equal(s.profile.household.status, 'empty')
})

test('mortgage answer leaves non-mortgage debt intact', () => {
  const s = state({ debt: 180000 })
  const r = respond('mortgage', '150k', s)
  assert.equal(r.updates?.mortgage?.value, 150000)
  assert.equal(s.profile.otherDebts.value, 180000)
  assert.equal(r.updates?.otherDebts, undefined)
})

test('"all of it" cannot reinterpret non-mortgage debt as a mortgage', () => {
  const r = respond('mortgage', 'All of it', state({ debt: 180000 }))
  assert.equal(r.updates, undefined)
})

test('a mortgage can exceed the independently reported other debts', () => {
  const r = respond('mortgage', '200,000', state({ debt: 180000 }))
  assert.equal(r.updates?.mortgage?.value, 200000)
})

test('"not sure" about the mortgage leaves other debts unchanged', () => {
  const r = respond('mortgage', 'not sure', state({ debt: 180000 }))
  assert.equal(r.updates?.mortgage?.status, 'unknown')
  assert.equal(r.updates?.otherDebts, undefined)
})

test('re-running the form updates its own answers but not confirmed ones', () => {
  const s = state({ income: 75000 })
  s.profile.income = { ...s.profile.income, status: 'confirmed' }
  const again = { ...s, form: { ...s.form, income: 90000 } }
  assert.equal(applyForm(again).profile?.income.value, 75000)
  const unconfirmed = state({ income: 75000 })
  assert.equal(applyForm({ ...unconfirmed, form: { ...unconfirmed.form, income: 90000 } }).profile?.income.value, 90000)
})
