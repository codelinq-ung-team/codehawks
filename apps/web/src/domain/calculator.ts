// Fields, parsing and the needs calculation. Pure functions, no UI.
// Model (simplified, for mentor review):
//   additional = max(0, support × years + mortgage + other debts + final expenses + education
//                       − existing coverage − savings)
// It leaves out inflation, investment returns, taxes and Social Security.

export type GroupId = 'household' | 'income' | 'debts' | 'future' | 'resources'
export type FieldId =
  | 'household' | 'youngestAge' | 'income' | 'support' | 'years' | 'mortgage'
  | 'otherDebts' | 'finalExpenses' | 'education' | 'existing' | 'savings'
export type FieldKind = 'choice' | 'age' | 'money' | 'years'
// required: must be known before we estimate. optional: can be left out of the math.
// context: shown to the user but never used in the math.
export type FieldRole = 'context' | 'required' | 'optional'
export type Household = 'both' | 'partner' | 'kids' | 'others' | 'none'

// 'unknown' is never treated as zero.
export type FieldStatus = 'empty' | 'unknown' | 'skipped' | 'proposed' | 'confirmed'
export type Field = { status: FieldStatus; value: number | Household | null; source?: 'form' | 'plaid' }
export type Profile = Record<FieldId, Field>

export type FieldDef = { id: FieldId; group: GroupId; label: string; kind: FieldKind; role: FieldRole }

export const GROUPS: { id: GroupId; title: string }[] = [
  { id: 'household', title: 'Your household' },
  { id: 'income', title: 'Income your family would need' },
  { id: 'debts', title: 'Debts and final costs' },
  { id: 'future', title: 'Future goals' },
  { id: 'resources', title: 'What you already have' },
]

export const FIELDS: FieldDef[] = [
  { id: 'household', group: 'household', label: 'Who depends on you', kind: 'choice', role: 'context' },
  { id: 'youngestAge', group: 'household', label: 'Youngest child’s age', kind: 'age', role: 'context' },
  { id: 'income', group: 'income', label: 'Your yearly income', kind: 'money', role: 'context' },
  { id: 'support', group: 'income', label: 'Yearly support needed', kind: 'money', role: 'required' },
  { id: 'years', group: 'income', label: 'Years of support', kind: 'years', role: 'required' },
  { id: 'mortgage', group: 'debts', label: 'Mortgage balance', kind: 'money', role: 'required' },
  { id: 'otherDebts', group: 'debts', label: 'Other debts', kind: 'money', role: 'required' },
  { id: 'finalExpenses', group: 'debts', label: 'Funeral and final expenses', kind: 'money', role: 'optional' },
  { id: 'education', group: 'future', label: 'Education or other future costs', kind: 'money', role: 'optional' },
  { id: 'existing', group: 'resources', label: 'Life insurance you already have', kind: 'money', role: 'required' },
  { id: 'savings', group: 'resources', label: 'Savings your family could use', kind: 'money', role: 'optional' },
]

export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.id, f])) as Record<FieldId, FieldDef>

export const HOUSEHOLD: Record<Household, string> = {
  both: 'My partner and kids',
  partner: 'My partner',
  kids: 'My kids',
  others: 'Parents or other family',
  none: 'No one right now',
}

export function emptyProfile(): Profile {
  return Object.fromEntries(FIELDS.map((f) => [f.id, { status: 'empty', value: null }])) as Profile
}

const UNSURE = /\b(not sure|unsure|no idea|don'?t know|do not know|idk|dunno|maybe later)\b|^\?+$/
const NONE = /^(none|no|nope|nothing|zero|n\/a|na|nah|\$?0+)\b|\b(don'?t have (any|one)|no (debts?|mortgage|insurance|coverage|savings))\b/
const SKIP = /\b(skip|leave (it|that) out|pass)\b/

export const isUnsure = (text: string) => UNSURE.test(text.toLowerCase().trim())
export const isSkip = (text: string) => SKIP.test(text.toLowerCase().trim())
export const isWhy = (text: string) => /\b(why|what does that mean|explain|what is that|what's that)\b/.test(text.toLowerCase())

export type ParsedAmount =
  | { kind: 'amount'; value: number; period: 'month' | 'year' | null }
  | { kind: 'empty' | 'unknown' | 'none' | 'negative' }

// "75k", "$75,000", "1.2 million", "5,000 a month", "none", "not sure"
export function parseAmount(raw: string): ParsedAmount {
  const text = String(raw).toLowerCase().trim()
  if (!text) return { kind: 'empty' }
  if (UNSURE.test(text)) return { kind: 'unknown' }
  if (NONE.test(text)) return { kind: 'amount', value: 0, period: null }
  const m = text.match(/(-)?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|grand|m|mil|million)?\b/)
  if (!m) return { kind: 'none' }
  if (m[1]) return { kind: 'negative' }
  let value = parseFloat(m[2].replace(/,/g, ''))
  const unit = m[3]
  if (unit === 'k' || unit === 'thousand' || unit === 'grand') value *= 1e3
  if (unit === 'm' || unit === 'mil' || unit === 'million') value *= 1e6
  let period: 'month' | 'year' | null = null
  if (/\b(a|per|each|every|\/)\s*(month|mo)\b|\bmonthly\b|\/mo\b/.test(text)) period = 'month'
  else if (/\b(a|per|each|every|\/)\s*(year|yr)\b|\b(yearly|annual(ly)?)\b|\/yr\b/.test(text)) period = 'year'
  return { kind: 'amount', value: Math.round(value), period }
}

export type ParsedCount =
  | { kind: 'amount'; value: number }
  | { kind: 'unknown' | 'none' }
  | { kind: 'range'; min: number; max: number }

// "10", "10 years". Anything vaguer gets asked again rather than guessed.
export function parseCount(raw: string, min: number, max: number): ParsedCount {
  const text = String(raw).toLowerCase().trim()
  if (UNSURE.test(text)) return { kind: 'unknown' }
  const m = text.match(/-?\d+(\.\d+)?/)
  if (!m) return { kind: 'none' }
  const n = Math.round(parseFloat(m[0]))
  if (n < min || n > max) return { kind: 'range', min, max }
  return { kind: 'amount', value: n }
}

export function formatMoney(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

// part / whole as a percent. Something above zero never reads "0%", and short of the whole never
// reads "100%": those ends get a decimal (0.4%, 99.6%), or "under 0.1%" / "over 99.9%".
export function formatPercent(part: number, whole: number) {
  const p = whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0
  if (p === 0 || p === 100) return `${p}%`
  if (p < 0.1) return 'under 0.1%'
  if (p > 99.9) return 'over 99.9%'
  if (p < 1 || p > 99) return `${p.toFixed(1)}%`
  return `${Math.round(p)}%`
}

export function formatField(id: FieldId, field: Field | undefined) {
  if (!field || field.status === 'empty') return ''
  if (field.status === 'unknown') return 'Not sure yet'
  if (field.status === 'skipped') return 'Left out'
  const def = FIELD[id]
  if (def.kind === 'choice') return HOUSEHOLD[field.value as Household] ?? ''
  const n = Number(field.value)
  if (def.kind === 'money') return formatMoney(n)
  if (def.kind === 'years') return n + (n === 1 ? ' year' : ' years')
  return n + (n === 1 ? ' year old' : ' years old')
}

const hasValue = (field: Field | undefined) =>
  !!field && (field.status === 'proposed' || field.status === 'confirmed') && field.value != null

// Which required fields still block an estimate.
export function missingRequired(profile: Profile): FieldId[] {
  return FIELDS.filter((f) => f.role === 'required' && !hasValue(profile[f.id])).map((f) => f.id)
}

const amount = (profile: Profile, id: FieldId) => (hasValue(profile[id]) ? Number(profile[id].value) : 0)

export type Term = { id: FieldId | 'newChild'; label: string; detail?: string; value: number; optional?: boolean; included: boolean }
export type Estimate =
  | { ready: false; missing: FieldId[] }
  | { ready: true; needs: Term[]; resources: Term[]; totalNeeds: number; totalResources: number; additional: number; leftOut: string[] }
export type Ready = Extract<Estimate, { ready: true }>

// What-if scenarios for the results story. They change the math only, never the saved answers.
//   newChild: a child arriving in about `inYears` years, supported to 18, with an education fund.
//   inflation: everyday costs rise by this much each year (0.03 = 3%).
export type Scenario = { newChild?: { inYears: number; education: number }; inflation?: number }
export const CHILD_SUPPORT_YEARS = 18

// `support` a year for `years`, each year costing (1 + rate) times the year before.
export function supportTotal(support: number, years: number, rate = 0) {
  return rate ? Math.round((support * ((1 + rate) ** years - 1)) / rate) : support * years
}

const scenarioYears = (years: number, s: Scenario) => (s.newChild ? Math.max(years, s.newChild.inYears + CHILD_SUPPORT_YEARS) : years)

// Returns every term shown on screen, so the page never computes a number itself.
export function calculate(profile: Profile, scenario: Scenario = {}): Estimate {
  const missing = missingRequired(profile)
  if (missing.length) return { ready: false, missing }

  const support = amount(profile, 'support')
  const years = scenarioYears(amount(profile, 'years'), scenario)
  const rate = scenario.inflation ?? 0
  const include = (t: Omit<Term, 'included'>): Term => ({ ...t, included: t.id === 'newChild' || !t.optional || hasValue(profile[t.id]) })
  const needs = [
    {
      id: 'support' as const, label: 'Yearly support', value: supportTotal(support, years, rate),
      detail: `${formatMoney(support)} × ${years} ${years === 1 ? 'year' : 'years'}${rate ? `, rising ${Math.round(rate * 1000) / 10}% a year` : ''}`,
    },
    { id: 'mortgage' as const, label: 'Mortgage balance', value: amount(profile, 'mortgage') },
    { id: 'otherDebts' as const, label: 'Other debts', value: amount(profile, 'otherDebts') },
    { id: 'finalExpenses' as const, label: 'Funeral and final expenses', value: amount(profile, 'finalExpenses'), optional: true },
    { id: 'education' as const, label: 'Education or other future costs', value: amount(profile, 'education'), optional: true },
    ...(scenario.newChild?.education ? [{ id: 'newChild' as const, label: 'New child’s education', value: scenario.newChild.education }] : []),
  ].map(include)
  const resources = [
    { id: 'existing' as const, label: 'Life insurance you have', value: amount(profile, 'existing') },
    { id: 'savings' as const, label: 'Savings your family could use', value: amount(profile, 'savings'), optional: true },
  ].map(include)

  const totalNeeds = needs.reduce((s, t) => s + (t.included ? t.value : 0), 0)
  const totalResources = resources.reduce((s, t) => s + (t.included ? t.value : 0), 0)
  return {
    ready: true,
    needs,
    resources,
    totalNeeds,
    totalResources,
    additional: Math.max(0, totalNeeds - totalResources),
    leftOut: [...needs, ...resources].filter((t) => !t.included).map((t) => t.label),
  }
}

export type ScenarioChange = { id: 'years' | 'inflation' | 'education'; label: string; value: number }
export type ScenarioResult = { base: Ready; next: Ready; years: number; nextYears: number; changes: ScenarioChange[] }

// Today's estimate next to the scenario's, with what each change adds. The changes sum to
// next.totalNeeds − base.totalNeeds because each one is the step between two calculate() runs.
export function compareScenario(profile: Profile, scenario: Scenario): ScenarioResult | null {
  const child = scenario.newChild && { ...scenario.newChild, education: 0 }
  const runs = [{}, { newChild: child }, { newChild: child, inflation: scenario.inflation }, scenario].map((s) => calculate(profile, s))
  if (!runs.every((r) => r.ready)) return null
  const [base, longer, inflated, next] = runs as Ready[]
  const years = amount(profile, 'years')
  const nextYears = scenarioYears(years, scenario)
  const steps: ScenarioChange[] = [
    { id: 'years', label: `Support for ${nextYears} years instead of ${years}`, value: longer.totalNeeds - base.totalNeeds },
    { id: 'inflation', label: `Prices rising ${Math.round((scenario.inflation ?? 0) * 1000) / 10}% a year`, value: inflated.totalNeeds - longer.totalNeeds },
    { id: 'education', label: 'New child’s education', value: next.totalNeeds - inflated.totalNeeds },
  ]
  return { base, next, years, nextYears, changes: steps.filter((c) => c.value > 0) }
}

export function summaryText(profile: Profile, result: Estimate) {
  const lines = ['Life insurance needs estimate', '', 'What I shared']
  FIELDS.forEach((f) => {
    const v = formatField(f.id, profile[f.id])
    if (v) lines.push(`- ${f.label}: ${v}`)
  })
  lines.push('')
  if (!result.ready) {
    lines.push(`Estimate not ready. Still needed: ${result.missing.map((id) => FIELD[id].label).join(', ')}.`)
    return lines.join('\n')
  }
  lines.push('The math')
  result.needs.filter((t) => t.included).forEach((t) => lines.push(`+ ${t.label}${t.detail ? ` (${t.detail})` : ''}: ${formatMoney(t.value)}`))
  result.resources.filter((t) => t.included).forEach((t) => lines.push(`- ${t.label}: ${formatMoney(t.value)}`))
  lines.push(`= Estimated additional coverage: ${formatMoney(result.additional)}`)
  if (result.leftOut.length) lines.push(`Left out: ${result.leftOut.join(', ')}.`)
  lines.push('')
  lines.push('This is a coverage needs estimate, not a quote. Any educational policy recommendation requires professional confirmation. It does not account for inflation, investment returns, taxes or Social Security.')
  return lines.join('\n')
}
