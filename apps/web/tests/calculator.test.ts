// Run with `npm test` (Node 22.18+ runs TypeScript directly).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyProfile, calculate, compareScenario, formatPercent, parseAmount, parseCount, supportTotal, type FieldId, type Profile } from '../src/domain/calculator.ts'

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

test('rising prices: $40k a year for 10 years at 3% comes to $458,555', () => {
  assert.equal(supportTotal(40000, 10, 0.03), 458555)
  assert.equal(supportTotal(40000, 10), 400000)
  assert.equal(additional(sample()), 500000)
  const r = calculate(sample(), { inflation: 0.03 })
  assert.ok(r.ready)
  assert.equal(r.additional, 558555)
})

test('a new child in 2 years stretches support to 20 years and adds their education', () => {
  const r = calculate(sample(), { newChild: { inYears: 2, education: 50000 } })
  assert.ok(r.ready)
  assert.equal(r.needs.find((t) => t.id === 'support')!.value, 800000)
  assert.equal(r.additional, 950000)
})

test('a new child never shortens support that already runs longer', () => {
  const r = calculate(sample({ years: 25 }), { newChild: { inYears: 2, education: 0 } })
  assert.ok(r.ready)
  assert.equal(r.additional, additional(sample({ years: 25 })))
})

test('scenario changes add up to the difference, and the answers are not touched', () => {
  const p = sample()
  const before = JSON.stringify(p)
  const s = compareScenario(p, { newChild: { inYears: 2, education: 50000 }, inflation: 0.03 })
  assert.ok(s)
  assert.equal(s.base.additional, 500000)
  assert.deepEqual(s.changes.map((c) => c.id), ['years', 'inflation', 'education'])
  assert.equal(s.changes.reduce((sum, c) => sum + c.value, 0), s.next.totalNeeds - s.base.totalNeeds)
  assert.equal(s.nextYears, 20)
  assert.equal(JSON.stringify(p), before)
})

test('no scenario means no changes', () => {
  const s = compareScenario(sample(), {})
  assert.ok(s)
  assert.equal(s.changes.length, 0)
  assert.equal(s.next.additional, s.base.additional)
})

test('percentages above zero never show 0%, and short of the whole never show 100%', () => {
  assert.equal(formatPercent(0, 600000), '0%')
  assert.equal(formatPercent(2500, 600000), '0.4%')
  assert.equal(formatPercent(100, 600000), 'under 0.1%')
  assert.equal(formatPercent(100000, 600000), '17%')
  assert.equal(formatPercent(597500, 600000), '99.6%')
  assert.equal(formatPercent(599999, 600000), 'over 99.9%')
  assert.equal(formatPercent(600000, 600000), '100%')
  assert.equal(formatPercent(900000, 600000), '100%')
  assert.equal(formatPercent(5, 0), '0%')
})
