// Run with `npm test` (Node 22.18+ runs TypeScript directly).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyProfile, calculate, compareScenario, formatField, formatPercent, formatPlans, outlook, parseAmount, parseCount, summaryText, supportTotal,
  type FieldId, type Profile,
} from '../src/domain/calculator.ts'

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
  const p = sample({ income: 13000, futureIncome: 60000, plans: 3, support: 1, years: 1, mortgage: 0, otherDebts: 8000, education: 0, existing: 0 })
  assert.equal(additional(p), 8001)
  const o = ahead(p)
  assert.deepEqual([o.support, o.years, o.mortgage, o.additional], [42000, 20, 180000, 1078000])
  assert.deepEqual(o.drivers.map((d) => [d.id, d.delta]), [['income', -1], ['kids', 890000], ['home', 180000]])
})

test('invalid support blocks saved or imported assessments without changing answers', () => {
  for (const status of ['proposed', 'confirmed'] as const) {
    for (const value of [0, -1, 0.4, NaN, Infinity, -Infinity, 'none', '1', null]) {
      const p = sample()
      p.support = { status, value: value as Profile['support']['value'] }
      assert.deepEqual(calculate(p), { ready: false, missing: ['support'] })
      assert.equal(compareScenario(p, { inflation: 0.03 }), null)
      assert.equal(outlook(p, calculate(p)).ready, false)
      assert.match(summaryText(p, calculate(p)), /Estimate not ready/)
      assert.deepEqual(p.support, { status, value })
    }
  }
})

test('one dollar of support is valid, including with no dependents and zero debts', () => {
  const p = sample({ support: 1, years: 1, mortgage: 0, otherDebts: 0, education: 0, existing: 0, savings: 0 })
  p.household = { status: 'confirmed', value: 'none' }
  assert.equal(additional(p), 1)
  p.existing.value = 1
  assert.equal(additional(p), 0)
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
