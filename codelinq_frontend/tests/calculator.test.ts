// Run with `npm test` (Node 22.18+ runs TypeScript directly).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyProfile, calculate, parseAmount, parseCount, type FieldId, type Profile } from '../src/domain/calculator.ts'

function sample(overrides: Partial<Record<FieldId, number>> = {}): Profile {
  const p = emptyProfile()
  const set = (id: FieldId, value: number) => { p[id] = { status: 'confirmed', value } }
  // A fictional sample household ($180,000 of debts split across two fields).
  set('support', 40000); set('years', 10); set('mortgage', 150000); set('otherDebts', 30000)
  set('education', 20000); set('existing', 100000)
  p.finalExpenses = { status: 'skipped', value: null }
  p.savings = { status: 'skipped', value: null }
  for (const [id, v] of Object.entries(overrides)) set(id as FieldId, v)
  return p
}

const additional = (p: Profile) => {
  const r = calculate(p)
  assert.ok(r.ready)
  return r.additional
}

test('sample household needs $500,000', () => {
  assert.equal(additional(sample()), 500000)
})

test('eight years of support gives $420,000', () => {
  assert.equal(additional(sample({ years: 8 })), 420000)
})

test('more coverage than needs shows zero, not a negative', () => {
  assert.equal(additional(sample({ existing: 2000000 })), 0)
})

test('an unknown required value blocks the estimate', () => {
  const p = sample()
  p.mortgage = { status: 'unknown', value: null }
  const r = calculate(p)
  assert.equal(r.ready, false)
  assert.ok(!r.ready && r.missing.length === 1 && r.missing[0] === 'mortgage')
})

test('skipped optional values are listed as left out', () => {
  const r = calculate(sample())
  assert.ok(r.ready)
  assert.deepEqual(r.leftOut, ['Funeral and final expenses', 'Savings your family could use'])
})

test('parses the ways people write amounts', () => {
  assert.deepEqual(parseAmount('$75,000'), { kind: 'amount', value: 75000, period: null })
  assert.deepEqual(parseAmount('75k'), { kind: 'amount', value: 75000, period: null })
  assert.deepEqual(parseAmount('about 1.2 million'), { kind: 'amount', value: 1200000, period: null })
  assert.deepEqual(parseAmount('none'), { kind: 'amount', value: 0, period: null })
  assert.deepEqual(parseAmount('$5,000 a month'), { kind: 'amount', value: 5000, period: 'month' })
  assert.equal(parseAmount('not sure').kind, 'unknown')
  assert.equal(parseAmount('-500').kind, 'negative')
  assert.equal(parseAmount('a lot').kind, 'none')
})

test('years must be in range', () => {
  assert.deepEqual(parseCount('15 years', 1, 70), { kind: 'amount', value: 15 })
  assert.equal(parseCount('90', 1, 70).kind, 'range')
})
