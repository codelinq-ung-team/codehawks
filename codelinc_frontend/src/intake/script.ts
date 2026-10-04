// Guided conversation: what to ask next, why we ask it, and how to read the answer.
// respond() reads an answer with fixed rules: it handles tapped suggestions and is the
// fallback when the AI can't be reached. interpret() takes the AI's reading of a typed
// answer and puts it through the same checks, so both return the same Reply shape.
import {
  FIELD, HOUSEHOLD, formatField, formatMoney, parseAmount, parseCount, isUnsure, isSkip, isWhy,
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
  read: (text: string, s: AppState) => Read
  ack: (v: number | Household, s: AppState) => string
  // Other fields this answer settles, like the debts left once the mortgage is known.
  also?: (v: number | Household, s: AppState) => Partial<Profile>
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
const hasKids = (s: AppState) => ['kids', 'both'].includes(String(val(s.profile, 'household')))
// Total debt from the form, when it's above zero. Abe then asks how much of it is the mortgage.
const debtTotal = (s: AppState) => (s.form.debt ?? 0) > 0 ? s.form.debt as number : null
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
    ask(s) {
      const n = s.form.dependents ?? 0
      if (n > 0) {
        return {
          text: `You mentioned ${n} ${n === 1 ? 'person depends' : 'people depend'} on your income. Who ${n === 1 ? 'is that' : 'are they'}?`,
          replies: Object.entries(HOUSEHOLD).filter(([k]) => k !== 'none').map(([, label]) => label),
        }
      }
      return { text: 'Let’s start with the people who count on you. Who depends on your income?', replies: Object.values(HOUSEHOLD) }
    },
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
    ask(s) {
      const total = debtTotal(s)
      if (total) {
        return {
          text: `You said you have about ${formatMoney(total)} in total debt. How much of that is left on a mortgage?`,
          replies: ['No mortgage', 'All of it', 'Not sure'],
        }
      }
      return { text: 'Do you have a mortgage? If so, about how much is left to pay?', replies: ['No mortgage', 'Not sure'] }
    },
    why: 'Paying off the house means your family could stay in their home without a monthly payment. You can find the balance on your latest mortgage statement.',
    read(text, s) {
      const total = debtTotal(s)
      if (!total) return moneyReader()(text)
      if (/\b(all( of it)?|the whole (thing|amount)|everything|it'?s all)\b/.test(text.toLowerCase())) return { value: total }
      const r = moneyReader()(text)
      if ('value' in r && Number(r.value) > total) {
        return { retry: `That’s more than the ${formatMoney(total)} total you entered. How much of the ${formatMoney(total)} is the mortgage? You can fix the total during review.` }
      }
      return r
    },
    also(v, s) {
      const total = debtTotal(s)
      return total ? { otherDebts: { status: 'proposed', value: total - Number(v) } } : {}
    },
    ack(v, s) {
      const total = debtTotal(s)
      if (!total) return v === 0 ? 'No mortgage, got it.' : `Thanks, ${money(v)} left on the mortgage.`
      if (v === 0) return `Got it, no mortgage. So all ${formatMoney(total)} is other debts.`
      if (v === total) return `Got it, all ${formatMoney(total)} is the mortgage.`
      return `Got it, ${money(v)} on the mortgage and ${formatMoney(total - Number(v))} in other debts.`
    },
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
    ask: (s) => s.form.coverage
      ? { text: 'You mentioned you have life insurance. About how much coverage is it in total, including any through work?', replies: ['Not sure'] }
      : { text: 'Do you already have life insurance, through work or on your own? What’s the total amount?', replies: ['None', 'Not sure'] },
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

// Apply the form's answers before the chat so Abe skips what's already known.
// Re-running it (after going back to the form) updates its own unconfirmed answers only.
export function applyForm(state: AppState): Partial<AppState> {
  const p = { ...state.profile }
  const f = state.form
  const set = (id: FieldId, value: Field['value']) => {
    if (value == null) return
    if (p[id].status === 'empty' || (p[id].source === 'form' && p[id].status === 'proposed')) {
      p[id] = { status: 'proposed', value, source: 'form' }
    }
  }
  set('income', f.income)
  // With no dependents we know the answer; otherwise Abe asks who they are.
  if (f.dependents === 0 && f.marital) set('household', f.marital === 'married' ? 'partner' : 'none')
  if (f.debt === 0) { set('mortgage', 0); set('otherDebts', 0) }
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
  const fromForm = Object.values(state.profile).some((f) => f.source === 'form')
  return [
    fromForm
      ? `Hi, I’m ${GUIDE_NAME}! Thanks for answering those first questions. I won’t ask them again. I just have a few follow-ups, one at a time.`
      : `Hi, I’m ${GUIDE_NAME}! I’ll ask a few short questions about your household, one at a time.`,
    'You can answer in your own words, tap a suggestion, or say “not sure.” Nothing is final until you review it.',
  ]
}

function done(step: Step, value: number | Household, extra: string[], state: AppState): Reply {
  return {
    updates: { ...step.also?.(value, state), [step.id]: { status: 'proposed', value } },
    say: extra.length ? extra : [step.ack(value, state)],
    pending: null,
  }
}

// Read one user message for the current step.
export function respond(stepId: FieldId, text: string, state: AppState): Reply {
  const step = STEP[stepId]
  const trimmed = text.trim()

  if (state.pending) {
    const t = trimmed.toLowerCase()
    const monthly = state.pending.value
    if (/\b(yes|yep|monthly|month|correct|right)\b/.test(t)) return done(step, monthly * 12, [`Thanks. That’s ${formatMoney(monthly * 12)} a year.`], state)
    if (/\b(no|nope|yearly|year|annual)\b/.test(t)) return done(step, monthly, [], state)
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

  return settle(step, step.read(trimmed, state), state)
}

function settle(step: Step, r: Read, state: AppState): Reply {
  if ('retry' in r) return { say: [r.retry], replies: question(step.id, state).replies }
  if ('clarify' in r) {
    return {
      say: [`Just to check: is ${formatMoney(r.clarify)} a month? That would be ${formatMoney(r.clarify * 12)} a year.`],
      pending: { value: r.clarify },
      replies: ['Yes, monthly', 'No, yearly'],
    }
  }
  return done(step, r.value, [], state)
}

// What the AI endpoint returns for one typed answer.
export type Reading = {
  intent: 'answer' | 'unsure' | 'skip' | 'why' | 'question' | 'unclear'
  value: number | null
  household: string | null
  period: 'month' | 'year' | null
  extra: Record<string, unknown>
  say: string
}

// The answers so far, sent with each question so the AI has context.
export function known(state: AppState): Record<string, number | string> {
  const facts: Record<string, number | string> = {}
  for (const id of Object.keys(state.profile) as FieldId[]) {
    const v = val(state.profile, id)
    if (v != null) facts[id] = v
  }
  const total = debtTotal(state)
  if (total) facts.totalDebt = total
  return facts
}

// Turn the AI's reading into a Reply. Values go back through each step's own reader,
// so the limits, the monthly check and the debt split apply exactly as they do for
// the script. The AI's own words are shown only for explanations and re-asks; every
// confirmation of an answer is the script's, so it can't disagree with the numbers.
export function interpret(stepId: FieldId, reading: Reading, state: AppState, typed = ''): Reply {
  const step = STEP[stepId]
  // A monthly amount is read by the script, which asks before turning it into a yearly one.
  const amount = parseAmount(typed)
  if (reading.intent === 'answer' && amount.kind === 'amount' && amount.period === 'month') return respond(stepId, typed, state)
  const replies = question(stepId, state).replies

  if (reading.intent === 'why' || (reading.intent === 'question' && !reading.say.trim())) return { say: [reading.say.trim() || step.why], why: true }
  if (reading.intent === 'unsure') return respond(stepId, 'not sure', { ...state, pending: null })
  if (reading.intent === 'skip') return respond(stepId, step.optional ? 'skip' : 'not sure', { ...state, pending: null })
  if (reading.intent !== 'answer') {
    return { say: [reading.say.trim() || 'Sorry, I didn’t catch that. Could you say it another way?'], replies }
  }

  const household = HOUSEHOLD[reading.household as Household]
  const text = stepId === 'household'
    ? household
    : reading.value == null ? undefined : String(reading.value) + (reading.period === 'month' ? ' a month' : '')
  if (text === undefined) return { say: ['Sorry, I didn’t catch that. Could you say it another way?'], replies }

  const reply = settle(step, step.read(text, state), state)
  if (!reply.updates) return reply

  // Other figures given in the same message fill empty fields only, and are named back.
  const noted: string[] = []
  for (const [id, raw] of Object.entries(reading.extra)) {
    const other = STEP[id as FieldId]
    if (!other || other.id === 'household' || typeof raw !== 'number') continue
    if (state.profile[other.id].status !== 'empty' || reply.updates[other.id]) continue
    const r = other.read(String(raw), state)
    if (!('value' in r)) continue
    Object.assign(reply.updates, other.also?.(r.value, state), { [other.id]: { status: 'proposed', value: r.value } })
    noted.push(`${FIELD[other.id].label.toLowerCase()} (${formatField(other.id, reply.updates[other.id])})`)
  }
  if (noted.length) reply.say.push(`I also noted your ${noted.join(' and ')}. You can change anything during review.`)
  return reply
}
