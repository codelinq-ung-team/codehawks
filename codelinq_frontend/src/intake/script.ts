// Guided conversation: what to ask next, why we ask it, and how to read the answer.
// This is the fallback engine. An AI endpoint should return the same Reply shape from
// respond() so the chat screen doesn't change.
import {
  HOUSEHOLD, formatMoney, parseAmount, parseCount, isUnsure, isSkip, isWhy,
  type Field, type FieldId, type Household, type Profile,
} from '../domain/calculator.ts'
import { GUIDE_NAME } from '../guide/guide.ts'
import type { AppState } from '../lib/store.ts'

type Read = { value: number | Household } | { retry: string } | { clarify: number }
type Question = { text: string; replies: string[] }
type Step = {
  id: FieldId
  when?: (s: AppState) => boolean
  ask: (s: AppState) => Question
  why: string
  optional?: boolean
  read: (text: string) => Read
  ack: (v: number | Household) => string
}
export type Reply = {
  updates?: Partial<Profile>
  say: string[]
  pending?: { value: number } | null
  replies?: string[]
  why?: boolean
}

const has = (p: Profile, id: FieldId) => p[id].status !== 'empty'
const val = (p: Profile, id: FieldId) => (p[id].status === 'proposed' || p[id].status === 'confirmed') ? p[id].value : null
const hasKids = (s: AppState) => s.flags.kids === true || ['kids', 'both'].includes(String(val(s.profile, 'household')))
const money = (v: number | Household) => formatMoney(Number(v))

function moneyReader(opts: { monthlyCheck?: boolean } = {}) {
  return (text: string): Read => {
    const r = parseAmount(text)
    if (r.kind === 'negative') return { retry: 'Amounts can’t be negative. What’s the amount?' }
    if (r.kind !== 'amount') return { retry: 'I didn’t catch an amount. You can type something like 75,000 or 75k, or say “not sure.”' }
    if (opts.monthlyCheck && r.period === 'month') return { clarify: r.value }
    return { value: r.value }
  }
}

function countReader(min: number, max: number, noun: string) {
  return (text: string): Read => {
    const r = parseCount(text, min, max)
    if (r.kind === 'range') return { retry: `Please enter ${noun} between ${min} and ${max}.` }
    if (r.kind !== 'amount') return { retry: `I didn’t catch ${noun}. Try a number like 10.` }
    return { value: r.value }
  }
}

const STEPS: Step[] = [
  {
    id: 'household',
    ask: () => ({ text: 'Let’s start with the people who count on you. Who depends on your income?', replies: Object.values(HOUSEHOLD) }),
    why: 'Life insurance is there for the people who rely on your paycheck. Knowing who they are helps us ask the right questions next.',
    read(text) {
      const t = text.toLowerCase()
      const partner = /partner|spouse|wife|husband|fianc/.test(t)
      const kids = /kid|child|son|daughter|baby|children/.test(t)
      if (/no one|nobody|none|just me|myself/.test(t)) return { value: 'none' }
      if (partner && kids) return { value: 'both' }
      if (partner) return { value: 'partner' }
      if (kids) return { value: 'kids' }
      if (/parent|mom|dad|mother|father|sibling|brother|sister|relative|family|grand/.test(t)) return { value: 'others' }
      return { retry: 'Could you tell me who that is? For example, a partner, kids, parents, or no one right now.' }
    },
    ack: (v) => v === 'none'
      ? 'Thanks. Even without dependents, coverage can help with debts and final costs, so we’ll look at those.'
      : 'Thanks for sharing that. We’ll keep them in mind as we go.',
  },
  {
    id: 'youngestAge',
    when: hasKids,
    ask: () => ({ text: 'How old is your youngest child?', replies: ['Under 1', '5', '10', '15'] }),
    why: 'Your youngest child’s age helps you think about how many years your family might need support. You’ll still choose the number of years yourself.',
    read(text) {
      if (/under\s*1|newborn|baby|infant|months?\b/.test(text.toLowerCase())) return { value: 0 }
      return countReader(0, 30, 'an age')(text)
    },
    ack: (v) => 'Got it, ' + (v === 0 ? 'under a year old' : v + ' years old') + '.',
  },
  {
    id: 'income',
    ask: () => ({ text: 'About how much do you earn in a year, before taxes?', replies: ['$50,000', '$75,000', '$100,000', 'Not sure'] }),
    why: 'Your income is what your family would lose. We use it as a starting point for how much support they’d need. It isn’t plugged straight into the math.',
    read: moneyReader({ monthlyCheck: true }),
    ack: (v) => `Thanks, ${money(v)} a year.`,
  },
  {
    id: 'support',
    ask(s) {
      const income = val(s.profile, 'income')
      if (typeof income === 'number' && income > 0) {
        const lo = Math.round(income * 0.7 / 1000) * 1000
        const hi = Math.round(income * 0.8 / 1000) * 1000
        return {
          text: `If something happened to you, how much would your family need each year to keep their life on track? Many people start with 70–80% of their income. For you, that’s about ${formatMoney(lo)} to ${formatMoney(hi)}.`,
          replies: [formatMoney(lo), formatMoney(hi), 'Not sure'],
        }
      }
      return { text: 'If something happened to you, how much would your family need each year to keep their life on track?', replies: ['$30,000', '$50,000', 'Not sure'] }
    },
    why: 'This is the yearly amount that would replace your paycheck for your family, covering things like groceries, rent, and bills. It’s often a bit less than your income because some of your own costs go away.',
    read: moneyReader({ monthlyCheck: true }),
    ack: (v) => `Okay, ${money(v)} a year.`,
  },
  {
    id: 'years',
    ask(s) {
      const age = val(s.profile, 'youngestAge')
      if (typeof age === 'number' && age < 22) {
        const until = 22 - age
        return {
          text: `For how many years should that support last? If you want to cover your youngest until about age 22, that’s ${until} years.`,
          replies: [`${until} years`, '10 years', '20 years', 'Not sure'],
        }
      }
      return { text: 'For how many years should that support last?', replies: ['5 years', '10 years', '20 years', 'Not sure'] }
    },
    why: 'Families often pick a time frame that lasts until the kids are grown, or until a partner retires. More years means more coverage.',
    read: countReader(1, 70, 'a number of years'),
    ack: (v) => `${v} ${v === 1 ? 'year' : 'years'} it is.`,
  },
  {
    id: 'mortgage',
    when: (s) => s.flags.mortgage !== false,
    ask: () => ({ text: 'Do you have a mortgage? If so, about how much is left to pay?', replies: ['No mortgage', 'Not sure'] }),
    why: 'Paying off the house means your family could stay in their home without a monthly payment. You can find the balance on your latest mortgage statement.',
    read: moneyReader(),
    ack: (v) => v === 0 ? 'No mortgage, got it.' : `Thanks, ${money(v)} left on the mortgage.`,
  },
  {
    id: 'otherDebts',
    ask: () => ({ text: 'Any other debts, like car loans, student loans, or credit cards? A rough total is fine.', replies: ['None', 'Not sure'] }),
    why: 'Debts don’t always go away when someone passes. Covering them keeps them from landing on your family.',
    read: moneyReader(),
    ack: (v) => v === 0 ? 'No other debts. Nice.' : `Got it, ${money(v)} in other debts.`,
  },
  {
    id: 'finalExpenses',
    ask: () => ({ text: 'Would you like to set aside an amount for funeral and final expenses? This one is optional.', replies: ['$10,000', '$15,000', 'Skip this'] }),
    why: 'Funeral costs and final bills come due quickly. Setting aside an amount means your family won’t have to cover them out of pocket.',
    optional: true,
    read: moneyReader(),
    ack: (v) => v === 0 ? 'Okay, nothing set aside.' : `Okay, ${money(v)} for final expenses.`,
  },
  {
    id: 'education',
    ask: (s) => hasKids(s)
      ? { text: 'Do you want to help pay for your kids’ education? If so, about how much in total? This one is optional.', replies: ['$20,000', '$50,000', 'Skip this'] }
      : { text: 'Is there a big future cost you’d want covered, like someone’s education? This one is optional.', replies: ['No', 'Skip this'] },
    why: 'College or training is a large cost many parents want covered. Include only what isn’t already part of the yearly support amount.',
    optional: true,
    read: moneyReader(),
    ack: (v) => v === 0 ? 'Okay, none for now.' : `Got it, ${money(v)} for future costs.`,
  },
  {
    id: 'existing',
    when: (s) => s.flags.coverage !== false,
    ask: () => ({ text: 'Do you already have life insurance, through work or on your own? What’s the total amount?', replies: ['None', 'Not sure'] }),
    why: 'Coverage you already have counts toward what your family needs. If it’s through work, check your benefits portal or ask HR for the amount.',
    read: moneyReader(),
    ack: (v) => v === 0 ? 'No current coverage, noted.' : `Great, ${money(v)} already in place.`,
  },
  {
    id: 'savings',
    ask: () => ({ text: 'Last one. Do you have savings or investments your family could use? This one is optional.', replies: ['None', 'Skip this'] }),
    why: 'Savings your family could draw on lowers how much insurance they’d need. Leave out retirement money you’d want them to keep.',
    optional: true,
    read: moneyReader(),
    ack: (v) => v === 0 ? 'Okay, no savings counted.' : `Thanks, ${money(v)} in savings.`,
  },
]

const STEP = Object.fromEntries(STEPS.map((s) => [s.id, s])) as Record<FieldId, Step>

export const WHY = 'Why do you ask?'
export const CLOSING = 'That’s everything I need. Let’s look over your answers together, and then I’ll show you the math.'

// Apply quick-start answers before the chat so we skip questions that don't apply.
export function applyQuickStart(state: AppState): Partial<AppState> {
  const p = { ...state.profile }
  const f = state.flags
  const set = (id: FieldId, value: Field['value']) => {
    if (p[id].status === 'empty' && value != null) p[id] = { status: 'proposed', value, source: 'quickstart' }
  }
  if (f.partner != null && f.kids != null) {
    set('household', f.partner && f.kids ? 'both' : f.partner ? 'partner' : f.kids ? 'kids' : null)
  }
  if (f.mortgage === false) set('mortgage', 0)
  if (f.coverage === false) set('existing', 0)
  return { profile: p }
}

export function nextStep(state: AppState): FieldId | null {
  const s = STEPS.find((st) => (!st.when || st.when(state)) && !has(state.profile, st.id))
  return s ? s.id : null
}

export function question(stepId: FieldId, state: AppState): Question {
  const q = STEP[stepId].ask(state)
  return { text: q.text, replies: [...q.replies, WHY] }
}

export function intro(state: AppState): string[] {
  const known: string[] = []
  if (state.profile.household.source === 'quickstart') known.push('who depends on you')
  if (state.profile.mortgage.source === 'quickstart') known.push('that you don’t have a mortgage')
  if (state.profile.existing.source === 'quickstart') known.push('that you don’t have coverage yet')
  const lines = [`Hi, I’m ${GUIDE_NAME}! I’ll ask a few short questions about your household, one at a time. You can answer in your own words, tap a suggestion, or say “not sure.” Nothing is final until you review it.`]
  if (known.length) lines.push(`From your quick start, I already know ${known.join(' and ')}, so we’ll skip ahead.`)
  return lines
}

function done(step: Step, value: number | Household, extra: string[]): Reply {
  return { updates: { [step.id]: { status: 'proposed', value } }, say: extra.length ? extra : [step.ack(value)], pending: null }
}

// Read one user message for the current step.
export function respond(stepId: FieldId, text: string, state: AppState): Reply {
  const step = STEP[stepId]
  const trimmed = text.trim()

  if (state.pending) {
    const t = trimmed.toLowerCase()
    const monthly = state.pending.value
    if (/\b(yes|yep|monthly|month|correct|right)\b/.test(t)) return done(step, monthly * 12, [`Thanks. That’s ${formatMoney(monthly * 12)} a year.`])
    if (/\b(no|nope|yearly|year|annual)\b/.test(t)) return done(step, monthly, [])
    return { say: [`Sorry, is ${formatMoney(monthly)} a monthly amount?`], pending: state.pending, replies: ['Yes, monthly', 'No, yearly'] }
  }

  if (isWhy(trimmed)) return { say: [step.why], why: true }
  if (isUnsure(trimmed)) {
    return {
      updates: { [stepId]: { status: 'unknown', value: null } },
      say: [step.optional
        ? 'No problem. We’ll leave it out for now, and you can add it during review.'
        : 'No problem. I’ll mark it as “not sure,” and you can fill it in during review. We’ll need it before I can do the math.'],
    }
  }
  if (step.optional && isSkip(trimmed)) {
    return { updates: { [stepId]: { status: 'skipped', value: null } }, say: ['Okay, we’ll leave that out of the math.'] }
  }

  const r = step.read(trimmed)
  if ('retry' in r) return { say: [r.retry], replies: question(stepId, state).replies }
  if ('clarify' in r) {
    return {
      say: [`Just to check: is ${formatMoney(r.clarify)} a month? That would be ${formatMoney(r.clarify * 12)} a year.`],
      pending: { value: r.clarify },
      replies: ['Yes, monthly', 'No, yearly'],
    }
  }
  return done(step, r.value, [])
}
