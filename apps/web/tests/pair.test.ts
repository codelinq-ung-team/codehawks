// Pairing with the headset: what the QR code holds, and reading what the headset saved.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { landing, qrText, shared } from '../src/intake/pair.ts'

const form = { income: 85000, marital: 'married', dependents: 2, debt: 280000, coverage: true }

test('the QR code holds only capitals and digits, so it stays small', () => {
  const text = qrText('0123456789ABCDEFGHJKMNPQRS')
  assert.equal(text, 'LINCLIFE:0123456789ABCDEFGHJKMNPQRS')
  assert.match(text, /^[0-9A-Z:]+$/)
})

test('answers saved by the headset fill the whole profile', () => {
  const r = shared({ status: 'done', form, profile: { support: { status: 'proposed', value: 60000 }, years: { status: 'unknown', value: null } } })
  assert.equal(r?.status, 'done')
  assert.deepEqual(r?.form, form)
  assert.deepEqual(r?.profile.support, { status: 'proposed', value: 60000 })
  assert.deepEqual(r?.profile.years, { status: 'unknown', value: null })
  assert.deepEqual(r?.profile.mortgage, { status: 'empty', value: null })
  assert.equal(Object.keys(r?.profile ?? {}).length, 13)
})

test('a reply that is not a pairing is ignored', () => {
  for (const bad of [null, {}, { status: 'joined' }, { status: 'paused', form, profile: {} }, { status: 'done', form: null, profile: {} }, { error: 'Not found' }]) {
    assert.equal(shared(bad), null)
  }
})

test('coming back from the headset lands on results only when the answers were confirmed there', () => {
  const required = ['support', 'years', 'mortgage', 'otherDebts', 'existing']
  const answers = (status: string) => Object.fromEntries(required.map((id) => [id, { status, value: 1 }]))
  assert.equal(landing(shared({ status: 'handoff', form, profile: answers('confirmed') })!.profile), 'results')
  assert.equal(landing(shared({ status: 'done', form, profile: answers('proposed') })!.profile), 'review')
  assert.equal(shared({ status: 'elsewhere', form, profile: {} }), null)
})
