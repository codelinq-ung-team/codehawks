import { FIELDS, formatMoney, type Profile } from '../domain/calculator.ts'
import { sha256 } from '../intake/ai.ts'

export const CATALOG_VERSION = 'lincoln-2026-10-04-v1'
export type CoveragePreferences = {
  state: string | null
  tobacco: 'yes' | 'no' | null
  goal: 'temporary' | 'lifelong' | 'both' | null
  premium: 'low' | 'higher' | null
  cashValue: 'yes' | 'no' | null
}
export const emptyPreferences = (): CoveragePreferences => ({ state: null, tobacco: null, goal: null, premium: null, cashValue: null })
export type PolicyOption = {
  policyId: string; name: string; category: 'term' | 'permanent'; amount: number; minimum: number
  termYears: number | null; fit: string; points: string[]; caveat: string; source: string; qualifications: string[]
}
export type Recommendation = {
  catalogVersion: string; amount: number; term: PolicyOption | null; permanent: PolicyOption | null
  recommendedType: 'term' | 'permanent' | null; reason: string
}
export type RecommendationCache = { key: string; result: Recommendation }

// Normalize to calculator order, strip source metadata and never send proposed values.
export function recommendationInput(profile: Profile, age: number | null, preferences: CoveragePreferences) {
  return { profile: Object.fromEntries(FIELDS.map(({ id }) => [id,
    profile[id].status === 'confirmed' ? { status: 'confirmed', value: profile[id].value }
      : { status: profile[id].status === 'skipped' ? 'skipped' : 'unknown', value: null }])), age, preferences }
}
export function recommendationKey(profile: Profile, age: number | null, preferences: CoveragePreferences) {
  return JSON.stringify([CATALOG_VERSION, recommendationInput(profile, age, preferences)])
}

function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 1000 }
function texts(value: unknown): value is string[] { return Array.isArray(value) && value.length <= 12 && value.every(text) }
const IDS = { term: ['termaccel', 'lifeelements'], permanent: ['wealthprotector', 'wealthaccelerate', 'wealthbuilder'] }

// Guard the whole response, including cached data, before putting a badge on a card.
export function checkedRecommendation(value: unknown, amount: number): Recommendation | null {
  const r = value as Recommendation | null
  if (!r || r.catalogVersion !== CATALOG_VERSION || r.amount !== amount || !text(r.reason)
    || ![null, 'term', 'permanent'].includes(r.recommendedType)) return null
  for (const category of ['term', 'permanent'] as const) {
    const p = r[category]
    if (p === null) continue
    if (!p || p.category !== category || !IDS[category].includes(p.policyId) || p.amount !== amount
      || !text(p.name) || !text(p.fit) || !text(p.caveat) || !texts(p.points) || !texts(p.qualifications)
      || !Number.isFinite(p.minimum) || p.minimum <= 0 || typeof p.source !== 'string') return null
    try {
      const url = new URL(p.source)
      if (url.protocol !== 'https:' || !['www.lincolnfinancial.com', 'visit.lfg.com', 'thecasongroup.com'].includes(url.hostname)) return null
    } catch { return null }
    if (category === 'term' ? ![10, 15, 20, 30].includes(p.termYears ?? 0) : p.termYears !== null) return null
  }
  if (r.recommendedType !== null && !r[r.recommendedType]) return null
  if (amount === 0 && (r.recommendedType !== null || r.term !== null || r.permanent !== null)) return null
  return r
}

export async function requestRecommendation(input: ReturnType<typeof recommendationInput>, amount: number, signal: AbortSignal) {
  const body = new TextEncoder().encode(JSON.stringify(input))
  const response = await fetch('/api/recommendations', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-amz-content-sha256': await sha256(body) },
    body, signal,
  })
  if (!response.ok) throw new Error('Recommendations unavailable')
  const result = checkedRecommendation(await response.json(), amount)
  if (!result) throw new Error('Invalid recommendation')
  return result
}

export function recommendationSummary(r: Recommendation) {
  return ['Educational coverage alternatives (not combined coverage or a quote)',
    ...(['term', 'permanent'] as const).map((category) => {
      const p = r[category]
      return p ? `${category === 'term' ? 'Term' : 'Permanent'}: ${p.name}; ${formatMoney(p.amount)} additional coverage; ${p.termYears ? `${p.termYears} years` : 'potential lifelong protection with adequate funding'}. ${p.fit}\nKeep in mind: ${p.caveat}\n${p.qualifications.join(' ')}\nSource: ${p.source}`
        : `${category}: No supported policy match or no additional coverage needed.`
    }), r.recommendedType ? `Recommended coverage type: ${r.recommendedType}. ${r.reason}` : r.reason,
    `Research catalog: ${r.catalogVersion}. Eligibility and quotes require professional confirmation.`].join('\n\n')
}
