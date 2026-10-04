import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyProfile } from '../src/domain/calculator.ts'
import { assessmentContext } from '../src/intake/assessmentContext.ts'
import type { AppState } from '../src/lib/store.ts'

test('every quiz answer, profile field, and prior message is included in Bedrock context', () => {
  const profile = emptyProfile()
  profile.mortgage = { status: 'proposed', value: 150000, source: 'plaid' }
  const state: AppState = {
    profile,
    form: { income: null, marital: 'married', dependents: 2, debt: null, coverage: true },
    messages: [{ role: 'bot', text: 'Question' }, { role: 'user', text: 'Answer' }],
    pending: null,
    started: true,
    typing: false,
    financialSnapshot: null,
    financialContextToken: 'signed-plaid-context',
  }
  const context = assessmentContext(state)
  assert.deepEqual(context.form, state.form)
  assert.deepEqual(context.profile.mortgage, { status: 'proposed', value: 150000, source: 'plaid' })
  assert.deepEqual(context.profile.income, { status: 'empty', value: null, source: null })
  assert.deepEqual(context.conversation, [{ role: 'bot', text: 'Question' }, { role: 'user', text: 'Answer' }])
  assert.equal(context.plaidConnected, true)
})
