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

export type Term = { id: FieldId; label: string; detail?: string; value: number; optional?: boolean; included: boolean }
export type Estimate =
  | { ready: false; missing: FieldId[] }
  | { ready: true; needs: Term[]; resources: Term[]; totalNeeds: number; totalResources: number; additional: number; leftOut: string[] }

// Returns every term shown on screen, so the page never computes a number itself.
export function calculate(profile: Profile): Estimate {
  const missing = missingRequired(profile)
  if (missing.length) return { ready: false, missing }

  const support = amount(profile, 'support')
  const years = amount(profile, 'years')
  const include = (t: Omit<Term, 'included'>): Term => ({ ...t, included: !t.optional || hasValue(profile[t.id]) })
  const needs = [
    { id: 'support' as const, label: 'Yearly support', detail: `${formatMoney(support)} × ${years} ${years === 1 ? 'year' : 'years'}`, value: support * years },
    { id: 'mortgage' as const, label: 'Mortgage balance', value: amount(profile, 'mortgage') },
    { id: 'otherDebts' as const, label: 'Other debts', value: amount(profile, 'otherDebts') },
    { id: 'finalExpenses' as const, label: 'Funeral and final expenses', value: amount(profile, 'finalExpenses'), optional: true },
    { id: 'education' as const, label: 'Education or other future costs', value: amount(profile, 'education'), optional: true },
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
  lines.push('This is an estimate to start a conversation, not a quote or recommendation. It does not account for inflation, investment returns, taxes or Social Security.')
  return lines.join('\n')
}
