// Form answers → chat: what gets prefilled, and how total debt splits into mortgage + other debts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyProfile } from '../src/domain/calculator.ts'
import type { AppState, Form } from '../src/lib/store.ts'
import { WHY, applyForm, interpret, known, nextStep, question, respond, type Reading } from '../src/intake/script.ts'

function state(form: Partial<Form> = {}): AppState {
  const s: AppState = {
    profile: emptyProfile(),
    form: { age: null, income: null, marital: null, dependents: null, debt: null, coverage: null, ...form },
    messages: [], pending: null, started: true, typing: false,
  }
  return { ...s, ...applyForm(s) }
}

test('form answers prefill the profile as proposed, not confirmed', () => {
  const s = state({ income: 75000, marital: 'married', dependents: 0, debt: 0, coverage: false })
  assert.deepEqual(s.profile.income, { status: 'proposed', value: 75000, source: 'form' })
  assert.equal(s.profile.household.value, 'partner')
  assert.equal(s.profile.mortgage.value, 0)
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

test('mortgage answer splits the form total into mortgage and other debts', () => {
  const s = state({ debt: 180000 })
  const r = respond('mortgage', '150k', s)
  assert.equal(r.updates?.mortgage?.value, 150000)
  assert.equal(r.updates?.otherDebts?.value, 30000)
})

test('"all of it" puts the whole total on the mortgage', () => {
  const r = respond('mortgage', 'All of it', state({ debt: 180000 }))
  assert.equal(r.updates?.mortgage?.value, 180000)
  assert.equal(r.updates?.otherDebts?.value, 0)
})

test('a mortgage above the total asks again', () => {
  const r = respond('mortgage', '200,000', state({ debt: 180000 }))
  assert.equal(r.updates, undefined)
})

test('"not sure" about the mortgage leaves other debts for Abe to ask', () => {
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

// The AI's reading of a typed answer goes through the same checks as the script.
const reading = (r: Partial<Reading>): Reading => ({ intent: 'answer', value: null, household: null, period: null, extra: {}, say: '', ...r })

test('an AI reading becomes a proposed answer with the script’s own confirmation', () => {
  const r = interpret('income', reading({ value: 80000, say: 'Got it, $90,000!' }), state())
  assert.deepEqual(r.updates?.income, { status: 'proposed', value: 80000 })
  assert.deepEqual(r.say, ['Thanks, $80,000 a year.'])
  const h = interpret('household', reading({ household: 'both' }), state())
  assert.equal(h.updates?.household?.value, 'both')
})

test('a monthly amount from the AI is checked, not multiplied silently', () => {
  const r = interpret('income', reading({ value: 6000, period: 'month' }), state())
  assert.equal(r.updates, undefined)
  assert.deepEqual(r.pending, { value: 6000 })
  // Even if the AI already multiplied it, the typed monthly amount is what gets checked.
  const m = interpret('income', reading({ value: 72000 }), state(), 'about 6k a month')
  assert.equal(m.updates, undefined)
  assert.deepEqual(m.pending, { value: 6000 })
})

test('AI values outside the limits ask again', () => {
  assert.equal(interpret('years', reading({ value: 500 }), state()).updates, undefined)
  assert.equal(interpret('income', reading({ value: -1 }), state()).updates, undefined)
  assert.equal(interpret('mortgage', reading({ value: 200000 }), state({ debt: 180000 })).updates, undefined)
  assert.equal(interpret('income', reading({}), state()).updates, undefined)
  assert.equal(interpret('household', reading({ household: 'pets' }), state()).updates, undefined)
})

test('extra figures fill empty fields only and are named back', () => {
  const s = state({ debt: 300000 })
  s.profile.existing = { status: 'confirmed', value: 50000 }
  const r = interpret('income', reading({ value: 90000, extra: { mortgage: 250000, existing: 1, years: 500, household: 'kids' } }), s)
  assert.equal(r.updates?.mortgage?.value, 250000)
  assert.equal(r.updates?.otherDebts?.value, 50000)
  assert.equal(r.updates?.existing, undefined)
  assert.equal(r.updates?.years, undefined)
  assert.match(r.say[1], /mortgage balance \(\$250,000\)/)
})

test('unsure, skip, why and side questions from the AI', () => {
  assert.equal(interpret('support', reading({ intent: 'unsure' }), state()).updates?.support?.status, 'unknown')
  assert.equal(interpret('savings', reading({ intent: 'skip' }), state()).updates?.savings?.status, 'skipped')
  // A required question can't be skipped; it's marked "not sure" instead.
  assert.equal(interpret('support', reading({ intent: 'skip' }), state()).updates?.support?.status, 'unknown')
  assert.equal(interpret('income', reading({ intent: 'why' }), state()).why, true)
  const q = interpret('existing', reading({ intent: 'question', say: 'Term covers a set number of years, like 20.' }), state())
  assert.equal(q.updates, undefined)
  assert.deepEqual(q.say, ['Term covers a set number of years, like 20.'])
  assert.ok(q.replies?.length)
})

test('known() lists answered fields and the form’s total debt', () => {
  const s = state({ income: 75000, debt: 180000 })
  assert.deepEqual(known(s), { income: 75000, totalDebt: 180000 })
})

test('the support suggestion never offers the same figure twice', () => {
  const ask = (income: number) => {
    const s = state({ income })
    s.profile.household = { status: 'proposed', value: 'none' }
    assert.equal(nextStep(s), 'support')
    return question('support', s)
  }
  const small = ask(5000)
  assert.match(small.text, /about \$3,500 to \$4,000\.$/)
  assert.deepEqual(small.replies, ['$3,500', '$4,000', 'Not sure', WHY])
  const tiny = ask(100)
  assert.match(tiny.text, /about \$100\.$/)
  assert.deepEqual(tiny.replies, ['$100', 'Not sure', WHY])
  const none = ask(1)
  assert.doesNotMatch(none.text, /For you/)
  assert.deepEqual(none.replies, ['Not sure', WHY])
  const usual = ask(90000)
  assert.match(usual.text, /about \$63,000 to \$72,000\.$/)
  assert.deepEqual(usual.replies, ['$63,000', '$72,000', 'Not sure', WHY])
})
