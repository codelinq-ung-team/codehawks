import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calculate, emptyProfile, type FieldId } from '../src/domain/calculator.ts'
import { CATALOG_VERSION, checkedRecommendation, emptyPreferences, recommendationInput, recommendationKey, recommendationSummary, requestRecommendation, RecommendationError, type Recommendation } from '../src/results/recommendations.ts'
import { validAdultAge } from '../src/intake/adultAge.ts'
import { payload } from '../src/results/ask.ts'

const profile = () => {
  const p = emptyProfile()
  for (const [id, value] of Object.entries({ support: 40000, years: 10, mortgage: 150000, otherDebts: 30000, education: 20000, existing: 100000 })) {
    p[id as FieldId] = { status: 'confirmed', value }
  }
  return p
}
const result = (): Recommendation => ({
  catalogVersion: CATALOG_VERSION, amount: 500000, recommendedType: 'term', reason: 'Your temporary support needs favor term.',
  term: { policyId: 'termaccel', name: 'Lincoln TermAccel Level Term', category: 'term', amount: 500000, minimum: 100000,
    termYears: 10, fit: 'Your family support has an end date.', points: ['Level premiums for the term.'], caveat: 'Approval is underwritten.',
    source: 'https://www.lincolnfinancial.com/public/individuals/products/lifeinsurance', qualifications: ['Confirm current eligibility.'] },
  permanent: { policyId: 'wealthprotector', name: 'Lincoln WealthProtector IUL', category: 'permanent', amount: 500000, minimum: 100000,
    termYears: null, fit: 'Protection-focused IUL.', points: ['Flexible premiums.'], caveat: 'Adequate funding is required.',
    source: 'https://visit.lfg.com/PTR-FACT-FST001', qualifications: ['Confirm state availability.'] },
})

test('shared calculator scenarios retain parity except website-disallowed zero support', () => {
  const cases = JSON.parse(readFileSync(new URL('./coverage-cases.json', import.meta.url), 'utf8')) as Array<{ name: string; values: Partial<Record<FieldId, number>>; expected: number }>
  for (const scenario of cases) {
    const p = emptyProfile()
    for (const [id, value] of Object.entries(scenario.values)) p[id as FieldId] = { status: 'confirmed', value }
    const r = calculate(p)
    if (scenario.values.support === 0) {
      assert.deepEqual(r, { ready: false, missing: ['support'] }, scenario.name)
      continue
    }
    assert.ok(r.ready)
    assert.equal(r.additional, scenario.expected, scenario.name)
  }
})

test('snapshot keys include every policy input and ignore metadata', () => {
  const p = profile(), prefs = emptyPreferences()
  const key = recommendationKey(p, 35, prefs)
  assert.notEqual(recommendationKey(p, 36, prefs), key)
  for (const [field, value] of Object.entries({ state: 'NY', tobacco: 'yes', goal: 'lifelong', premium: 'higher', cashValue: 'yes', health: 'fair' })) {
    assert.notEqual(recommendationKey(p, 35, { ...prefs, [field]: value }), key)
  }
  assert.notEqual(recommendationKey({ ...p, years: { status: 'confirmed', value: 20 } }, 35, prefs), key)
  assert.equal(recommendationKey({ ...p, support: { ...p.support, source: 'plaid' } }, 35, prefs), key)
  p.savings = { status: 'proposed', value: 90000, source: 'plaid' }
  assert.deepEqual(recommendationInput(p, 35, prefs).profile.savings, { status: 'unknown', value: null })
})

test('only complete matching responses can put a banner on a card', () => {
  assert.ok(checkedRecommendation(result(), 500000))
  assert.equal(checkedRecommendation(result(), 499999), null)
  assert.equal(checkedRecommendation({ ...result(), catalogVersion: 'old' }, 500000), null)
  assert.equal(checkedRecommendation({ ...result(), term: null }, 500000), null)
  assert.equal(checkedRecommendation({ ...result(), recommendedType: 'both' }, 500000), null)
  assert.equal(checkedRecommendation({ ...result(), recommendedType: null }, 500000), null)
  for (const changes of [{ source: 'javascript:alert(1)' }, { source: 'https://fake.example/quote' },
    { policyId: 'made-up' }, { category: 'permanent' }, { termYears: 70 }, { points: 'not a list' }, { amount: 1 }]) {
    const r = result()
    Object.assign(r.term!, changes)
    assert.equal(checkedRecommendation(r, 500000), null)
  }
  assert.ok(checkedRecommendation({ catalogVersion: CATALOG_VERSION, amount: 0, term: null, permanent: null, recommendedType: null, reason: 'Already covered.' }, 0))
})

test('adult age is required before sending a comparison; no-match adult ages remain valid', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(result()))
  for (const age of [null, -1, 0, 17, 18.5, 121, NaN]) {
    assert.equal(validAdultAge(age), false)
    await assert.rejects(requestRecommendation(recommendationInput(profile(), age, emptyPreferences()), 500000, new AbortController().signal),
      (error: unknown) => error instanceof RecommendationError && error.kind === 'input')
  }
  assert.equal(fetch.mock.callCount(), 0, 'Invalid ages must never contact the API')
  for (const age of [18, 80, 81, 120]) assert.equal(validAdultAge(age), true)
  assert.equal(validAdultAge('35'), false)
  assert.equal(validAdultAge(true), false)
})

test('single-category and no-match responses are valid; unavailable alternatives need no banner', () => {
  for (const category of ['term', 'permanent'] as const) {
    const r = result()
    r.recommendedType = category
    r[category === 'term' ? 'permanent' : 'term'] = null
    assert.ok(checkedRecommendation(r, 500000))
  }
  assert.ok(checkedRecommendation({ ...result(), term: null, permanent: null, recommendedType: null }, 500000))
})

test('comparison errors distinguish input, busy, timeout, unavailable and invalid replies', async (t) => {
  const input = recommendationInput(profile(), 35, emptyPreferences())
  for (const [status, kind] of [[400, 'input'], [429, 'busy'], [504, 'timeout'], [502, 'unavailable']] as const) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'sanitized server error' }, { status }))
    await assert.rejects(requestRecommendation(input, 500000, new AbortController().signal),
      (error: unknown) => error instanceof RecommendationError && error.kind === kind)
  }
  for (const reply of [Response.json({ recommendedType: 'term' }), new Response('not json')]) {
    t.mock.method(globalThis, 'fetch', async () => reply)
    await assert.rejects(requestRecommendation(input, 500000, new AbortController().signal),
      (error: unknown) => error instanceof RecommendationError && error.kind === 'invalid')
  }
  const ctrl = new AbortController()
  t.mock.method(globalThis, 'fetch', async () => { ctrl.abort(); throw new DOMException('Aborted', 'AbortError') })
  await assert.rejects(requestRecommendation(input, 500000, ctrl.signal),
    (error: unknown) => error instanceof RecommendationError && error.kind === 'timeout')
})

test('summary and Ask Abe carry the same policy recommendation and qualifications', () => {
  const p = profile(), r = calculate(p)
  assert.ok(r.ready)
  const summary = recommendationSummary(result())
  assert.match(summary, /not combined coverage/)
  assert.match(summary, /Recommended coverage type: term/)
  assert.match(summary, /Lincoln WealthProtector IUL/)
  assert.match(summary, /Adequate funding/)
  const messages = payload([{ role: 'user', text: 'Why this policy?' }], p, r, result())
  assert.ok(messages[0].content.includes(summary))
})

test('request hashes exact bytes, honors aborts and rejects partial responses', async (t) => {
  const input = recommendationInput(profile(), 35, emptyPreferences())
  const ctrl = new AbortController()
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options?: RequestInit) => {
    assert.equal(_url, '/api/recommendations')
    assert.equal(options?.signal, ctrl.signal)
    const bytes = options?.body as Uint8Array
    const expected = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')
    assert.equal((options?.headers as Record<string, string>)['x-amz-content-sha256'], expected)
    assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)), input)
    return Response.json(result())
  })
  assert.equal((await requestRecommendation(input, 500000, ctrl.signal)).recommendedType, 'term')
  t.mock.method(globalThis, 'fetch', async () => Response.json({ recommendedType: 'term' }))
  await assert.rejects(requestRecommendation(input, 500000, ctrl.signal), /Invalid recommendation/)
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'rate limited' }, { status: 429 }))
  await assert.rejects(requestRecommendation(input, 500000, ctrl.signal), /unavailable/)
})
