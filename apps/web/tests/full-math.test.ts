import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { FullMath } from '../src/results/FullMath.tsx'
import { calculate, emptyProfile, fundsAfterCosts, summaryText, type FieldId } from '../src/domain/calculator.ts'
import { payload } from '../src/results/ask.ts'

let server: ViteDevServer
let fullMath: typeof FullMath
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  fullMath = (await server.ssrLoadModule('/src/results/FullMath.tsx')).FullMath
})
after(async () => { await server?.close() })

function sample(overrides: Partial<Record<FieldId, number>> = {}) {
  const p = emptyProfile()
  for (const [id, value] of Object.entries({ support: 69000, years: 5, mortgage: 56302,
    otherDebts: 107404, finalExpenses: 10000, education: 0, existing: 0, savings: 62589, ...overrides })) {
    p[id as FieldId] = { status: 'confirmed', value }
  }
  return p
}

test('issue 55 reconciles the coverage gap and funds remaining after costs', () => {
  const r = calculate(sample())
  assert.ok(r.ready)
  const f = fundsAfterCosts(r)
  assert.equal(r.additional, 456117)
  assert.equal(r.totalNeeds, 518706)
  assert.deepEqual([f.fundsAvailable, f.costsSetAside, f.remainingSupport], [518706, 173706, 345000])
})

test('resources above needs remain available and no additional coverage is added', () => {
  const r = calculate(sample({ existing: 1000000 }))
  assert.ok(r.ready)
  assert.equal(r.additional, 0)
  const f = fundsAfterCosts(r)
  assert.equal(f.fundsAvailable, 1062589)
  assert.equal(f.remainingSupport, 888883)
})

test('zero costs and positive support reconcile without negative balances', () => {
  for (const support of [1, 69000]) {
    const r = calculate(sample({ support, mortgage: 0, otherDebts: 0, finalExpenses: 0, education: 0, existing: 0, savings: 0 }))
    assert.ok(r.ready)
    const f = fundsAfterCosts(r)
    assert.equal(f.costsSetAside, 0)
    assert.equal(f.remainingSupport, support * 5)
  }
})

test('rendered sections show opposite signs, correct row order, and unsigned zeroes', () => {
  const r = calculate(sample())
  assert.ok(r.ready)
  const html = renderToStaticMarkup(createElement(fullMath, { r }))
  const sections = html.split('After setting aside costs')
  assert.equal(sections.length, 2)
  assert.ok(sections[0].includes('How much additional coverage?'))
  assert.ok(sections[0].includes('+ $56,302'))
  assert.ok(sections[0].includes('− $62,589'))
  assert.ok(sections[1].includes('+ $62,589'))
  assert.ok(sections[1].includes('− $56,302'))
  assert.ok(sections[1].indexOf('Funds available if the gap is filled') < sections[1].indexOf('Mortgage balance'))
  assert.ok(sections[1].indexOf('Mortgage balance') < sections[1].indexOf('Remaining for ongoing support'))
  assert.ok(sections[0].includes('Estimated additional coverage'))
  assert.ok(sections[1].includes('$345,000'))
  assert.ok(html.includes('Set aside for future costs'))
  assert.ok(html.includes('assumes the estimated coverage gap is filled'))
  assert.ok(!/[+−] \$0</.test(html))
  assert.ok(!html.includes('year one'))
})

test('unknown and skipped optional amounts are omitted from both views', () => {
  const p = sample()
  p.finalExpenses = { status: 'skipped', value: null }
  p.education = { status: 'unknown', value: null }
  p.savings = { status: 'skipped', value: null }
  const r = calculate(p)
  assert.ok(r.ready)
  assert.equal(fundsAfterCosts(r).costsSetAside, 163706)
  const html = renderToStaticMarkup(createElement(fullMath, { r }))
  assert.ok(!html.includes('>Funeral and final expenses<'))
  assert.ok(!html.includes('>Savings your family could use<'))
  assert.ok(!html.includes('>Education or other future costs<'))
  assert.ok(html.includes('Not included in either view: funeral and final expenses, education or other future costs, savings your family could use.'))
})

test('copy summary and Abe context carry the same two reconciled views', () => {
  const p = sample()
  const r = calculate(p)
  assert.ok(r.ready)
  const summary = summaryText(p, r)
  for (const text of ['How much additional coverage?', 'Estimated additional coverage: $456,117',
    'After setting aside costs', 'assumes the estimated coverage gap is filled',
    'Funds available if the gap is filled: $518,706', 'Costs paid or set aside: $173,706',
    'Remaining for ongoing support: $345,000', 'Education or other future costs (set aside for future costs): $0']) {
    assert.ok(summary.includes(text), text)
  }
  assert.ok(!/[+−] \$0(?:\n|$)/.test(summary))
  const messages = payload([{ role: 'user', text: 'How are expenses paid?' }], p, r)
  assert.ok(messages[0].content.includes(summary))
})
