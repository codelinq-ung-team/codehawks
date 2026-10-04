// Run with `npm test` (Node 22.18+ runs TypeScript directly).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyProfile, calculate, formatField, formatPlans, outlook, parseAmount, parseCount, summaryText, type FieldId, type Profile } from '../src/domain/calculator.ts'

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

// ---------- looking ahead ----------
// The same cases as apps/backend/tests/test_recommendations.py and the Quest app's Tests.cs.
const ahead = (p: Profile) => {
  const o = outlook(p, calculate(p))
  assert.ok(o.ready)
  return o
}

test('no outlook until a look-ahead question is answered, and today’s estimate never moves', () => {
  const p = sample()
  assert.equal(outlook(p, calculate(p)).ready, false)
  const planned = sample({ income: 50000, futureIncome: 100000, plans: 2 })
  assert.equal(additional(planned), 500000)
  assert.doesNotMatch(summaryText(p, calculate(p)), /Looking ahead/)
})

test('a higher income keeps support’s share, and a home is three times income', () => {
  const o = ahead(sample({ income: 50000, futureIncome: 100000, plans: 2 }))
  assert.deepEqual([o.support, o.years, o.mortgage, o.additional, o.change], [80000, 10, 300000, 1050000, 550000])
  assert.deepEqual(o.drivers.map((d) => [d.id, d.delta]), [['income', 400000], ['home', 150000]])
})

test('someone starting out: kids and a home on a future income', () => {
  const p = sample({ income: 13000, futureIncome: 60000, plans: 3, support: 0, years: 1, mortgage: 0, otherDebts: 8000, education: 0, existing: 0 })
  assert.equal(additional(p), 8000)
  const o = ahead(p)
  assert.deepEqual([o.support, o.years, o.mortgage, o.additional], [42000, 22, 180000, 1112000])
  assert.deepEqual(o.drivers.map((d) => [d.id, d.delta]), [['kids', 924000], ['home', 180000]])
})

test('a partner means at least 70% of income for at least ten years', () => {
  const o = ahead(sample({ income: 60000, plans: 4 }))
  assert.deepEqual([o.support, o.years, o.additional], [42000, 10, 520000])
})

test('no changes expected leaves the outlook equal to today', () => {
  const o = ahead(sample({ income: 50000, futureIncome: 50000, plans: 0 }))
  assert.deepEqual([o.drivers.length, o.change, o.additional], [0, 0, 500000])
  assert.match(summaryText(sample({ plans: 0 }), calculate(sample({ plans: 0 }))), /the same as today/)
})

test('a lower expected income shrinks the outlook, never below zero', () => {
  const o = ahead(sample({ income: 50000, futureIncome: 25000 }))
  assert.deepEqual([o.support, o.additional, o.drivers[0].delta], [20000, 300000, -200000])
})

test('plans read back as words', () => {
  assert.equal(formatPlans(0), 'None of these')
  assert.equal(formatPlans(3), 'Kids and a home')
  assert.equal(formatPlans(7), 'Kids, a home and a partner')
  assert.equal(formatField('plans', { status: 'confirmed', value: 6 }), 'A home and a partner')
  assert.match(summaryText(sample({ income: 50000, futureIncome: 100000, plans: 2 }), calculate(sample({ income: 50000, futureIncome: 100000, plans: 2 }))),
    /\+ A higher income .*: \$400,000\n\+ A home .*: \$150,000\n= Coverage to consider by then: \$1,050,000 \(\$500,000 today\)/)
})
