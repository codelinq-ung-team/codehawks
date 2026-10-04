import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { Plans } from '../src/results/Plans.tsx'
import { calculate, emptyProfile, type FieldId } from '../src/domain/calculator.ts'
import { DEFAULT_POLICIES } from '../src/results/defaultPolicies.ts'
import { CATALOG_VERSION, recommendationSummary, type PolicyOption, type Recommendation } from '../src/results/recommendations.ts'

let server: ViteDevServer
let plans: typeof Plans
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  plans = (await server.ssrLoadModule('/src/results/Plans.tsx')).Plans
})
after(async () => { await server?.close() })

function option(category: 'term' | 'permanent'): PolicyOption {
  return { policyId: category === 'term' ? 'lifeelements' : 'wealthbuilder', category,
    name: `Selected ${category} policy`, amount: 500000, minimum: 100000,
    termYears: category === 'term' ? 20 : null, points: [`Selected ${category} benefit`],
    caveat: `Selected ${category} caveat`, fit: `Selected ${category} explanation`,
    qualifications: [`Selected ${category} qualification`], source: 'https://visit.lfg.com/selected' }
}
function recommendation(recommendedType: Recommendation['recommendedType']): Recommendation {
  return { catalogVersion: CATALOG_VERSION, amount: 500000, recommendedType,
    term: option('term'), permanent: option('permanent'), reason: 'Selected recommendation reason' }
}
function render(result: Recommendation | null, state: { loading?: boolean; failed?: boolean } = {}) {
  const p = emptyProfile()
  for (const [id, value] of Object.entries({ support: 40000, years: 10, mortgage: 150000, otherDebts: 0, existing: 50000 })) {
    p[id as FieldId] = { status: 'confirmed', value }
  }
  const r = calculate(p)
  assert.ok(r.ready)
  return renderToStaticMarkup(createElement(plans, { p, r, recommendation: result,
    loading: false, failed: false, ...state, onAsk() {}, onRetry() {} }))
}
function cards(html: string) {
  const found = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(m => m[0])
  assert.equal(found.length, 2)
  return found
}
function assertExample(card: string, category: 'term' | 'permanent') {
  const policy = DEFAULT_POLICIES[category]
  for (const text of [policy.name, 'Example policy', 'About this policy', policy.caveat,
    ...policy.points, policy.source, 'Published coverage minimum:', 'Published issue ages:',
    'No personalized policy selected; availability depends on eligibility.']) assert.ok(card.includes(text), text)
  assert.ok(!card.includes('Why it fits'))
  assert.ok(!card.includes(', recommended'))
  assert.ok(!card.includes('<span>additional coverage</span>'))
}

test('selected recommended and alternative policies retain all specifications', () => {
  for (const preferred of ['term', 'permanent'] as const) {
    const html = render(recommendation(preferred))
    const rendered = cards(html)
    for (const [index, category] of (['term', 'permanent'] as const).entries()) {
      const card = rendered[index]
      for (const text of [`Selected ${category} policy`, `Selected ${category} benefit`,
        `Selected ${category} caveat`, `Selected ${category} explanation`, `Selected ${category} qualification`,
        '$500,000', 'https://visit.lfg.com/selected']) assert.ok(card.includes(text), text)
      assert.ok(card.includes(category === preferred ? 'Why it fits' : 'In your estimate'))
      assert.ok(!card.includes('Example policy'))
    }
    assert.equal((html.match(/>Recommended</g) ?? []).length, 1)
  }
})

test('a missing alternative uses only its category default', () => {
  for (const preferred of ['term', 'permanent'] as const) {
    const result = recommendation(preferred)
    const missing = preferred === 'term' ? 'permanent' : 'term'
    result[missing] = null
    const html = render(result)
    const rendered = cards(html)
    assertExample(rendered[missing === 'term' ? 0 : 1], missing)
    assert.ok(html.includes(`Selected ${preferred} policy`))
    const summary = recommendationSummary(result)
    assert.ok(!summary.includes(DEFAULT_POLICIES[missing].name))
    assert.equal(result[missing], null)
  }
})

test('loading, failed, unavailable and zero-gap results show complete examples', () => {
  const unavailable = { ...recommendation(null), term: null, permanent: null }
  const scenarios = [
    render(null, { loading: true }), render(null, { failed: true }), render(unavailable),
    render({ ...unavailable, amount: 0, reason: 'Your listed needs are already covered.' }),
  ]
  for (const html of scenarios) {
    const rendered = cards(html)
    assertExample(rendered[0], 'term')
    assertExample(rendered[1], 'permanent')
    assert.ok(!html.includes('>Recommended<'))
  }
  assert.ok(scenarios[0].includes('Abe is comparing'))
  assert.ok(scenarios[1].includes('Try Again'))
  assert.ok(scenarios[2].includes('no supported policy match'))
  assert.ok(scenarios[3].includes('Your listed needs are already covered.'))
})

test('default policy facts match the reviewed backend catalog', () => {
  const catalogPath = new URL('../../backend/policy_catalog.py', import.meta.url)
  const loaded = spawnSync('python', ['-c', 'import json,runpy,sys; print(json.dumps(runpy.run_path(sys.argv[1])["POLICIES"]))', fileURLToPath(catalogPath)], { encoding: 'utf8' })
  assert.equal(loaded.status, 0, loaded.stderr || loaded.error?.message)
  const catalog = JSON.parse(loaded.stdout) as Array<Record<string, unknown>>
  for (const policy of Object.values(DEFAULT_POLICIES)) {
    const entry = catalog.find(p => p.id === policy.policyId)
    assert.ok(entry)
    for (const key of ['name', 'category', 'minimum', 'maximum', 'ages', 'excluded', 'points', 'caveat', 'source'] as const) {
      assert.deepEqual(policy[key], entry[key], `${policy.policyId}: ${key}`)
    }
    assert.deepEqual(policy.terms, Object.keys(entry.terms ?? {}).map(Number))
  }
})
