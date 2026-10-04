// Questions for Abe after the results. They go to the AI (POST /api/chat); when it can't be
// reached, Abe falls back on written answers that use the user's own numbers. Abe never works out new amounts: every number
// he quotes comes from calculate(), and what-ifs go to the "Try it yourself" step.
import { formatMoney, summaryText, type Estimate, type Profile } from '../domain/calculator.ts'
import { GUIDE_NAME } from '../guide/guide.ts'
import { sha256 } from '../intake/ai.ts'
import { recommendationSummary, type Recommendation } from './recommendations.ts'

export type Ready = Extract<Estimate, { ready: true }>
export type Said = { role: 'user' | 'assistant'; text: string }
export type TopicId = 'term' | 'years' | 'leftOut' | 'next'
export type Sent = { role: Said['role']; content: string }

export const listJoin = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
export const yearsText = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`

export const GREETING = 'Anything you’d like me to explain? Ask me about your estimate, or about life insurance in general.'
export const OFFLINE = 'I can’t look that up right now. For the moment I can explain term vs. permanent coverage, your years of support, what this estimate leaves out, or what to do next. For anything else, a licensed insurance professional can help, and your summary has all your numbers.'

// Abe's written answer on one topic, using the user's own numbers.
export function written(id: TopicId, p: Profile, r: Ready): string {
  const years = Number(p.years.value)
  const support = Number(p.support.value)
  switch (id) {
    case 'term': {
      const mortgage = p.mortgage.status === 'confirmed' && Number(p.mortgage.value) > 0
      return [
        'Here’s how the two fit what you told me.',
        `Your everyday costs, ${formatMoney(support)} a year for ${yearsText(years)}, have an end date. **Term insurance** is built around needs like that: it covers a set number of years, often 10, 20 or 30, and usually costs less for the same amount of coverage.${mortgage ? ' Your mortgage shrinks over time too, which fits the same idea.' : ''}`,
        '**Permanent insurance**, such as whole life, is designed to last your whole life, and some kinds build cash value. It costs more for the same amount, so people often use it for needs with no end date, like final expenses or leaving something behind.',
        'Some families use a mix of both. A licensed professional can price each one for your situation.',
      ].join('\n\n')
    }
    case 'years': {
      const supportTotal = r.needs.find((t) => t.id === 'support')!.value
      const startAge = p.youngestAge.status === 'confirmed' && p.household.value !== 'none' ? Number(p.youngestAge.value) : null
      return [
        `You told me your family would need ${formatMoney(support)} a year for ${yearsText(years)}. Stacked up, that comes to ${formatMoney(supportTotal)} of your estimate.`,
        `Many people pick the number of years until their youngest is grown or done with school.${startAge != null ? ` By then, your youngest would be ${startAge + years}.` : ''}`,
        'Want to see a different number? Change it on the **Try it yourself** step in the slides above, and the estimate updates right away.',
      ].join('\n\n')
    }
    case 'leftOut':
      return [
        'This estimate keeps the math simple on purpose. It doesn’t account for:',
        [
          '- **Inflation**, which makes future costs higher',
          '- **Investment returns** on a payout, which could make it last longer',
          '- **Taxes**, which depend on your situation',
          '- **Social Security** survivor benefits, which some families can get',
        ].join('\n'),
        r.leftOut.length ? `You also didn’t give amounts for ${listJoin(r.leftOut.map((l) => l.toLowerCase()))}, so they aren’t counted.` : '',
        'A licensed professional can factor these in for you.',
      ].filter(Boolean).join('\n\n')
    case 'next':
      return [
        'Nothing here needs a decision today. When you’re ready:',
        [
          '1. Tap **Copy Summary** to save your numbers.',
          '2. Bring them to a licensed insurance professional. They can show you real quotes for term and permanent coverage.',
          '3. Check your estimate again after big changes, like a new home or a new baby.',
        ].join('\n'),
      ].join('\n\n')
  }
}

// Which written answer fits a typed question, for when the AI can't be reached.
export function topicFor(text: string): TopicId | null {
  const t = text.toLowerCase()
  if (/\b(term|permanent|whole life|universal|cash value)\b/.test(t)) return 'term'
  if (/\b(leave|left|missing|inflation|tax|taxes|social security|invest\w*)\b/.test(t)) return 'leftOut'
  if (/\b(next|agent|professional|advisor|quotes?|buy|apply)\b/.test(t)) return 'next'
  if (/\b(years?|how long)\b/.test(t)) return 'years'
  return null
}

// The backend's chat speaks as a general explainer and knows nothing about this user, so the
// first question carries who Abe is and the user's estimate. It's rebuilt for every question,
// so a what-if change on the slides reaches Abe too.
function context(p: Profile, r: Ready, recommendation?: Recommendation | null) {
  return [
    `[Context from the LincLife results page. You are ${GUIDE_NAME}, the site’s guide. Answer as ${GUIDE_NAME}: warm, calm and plain, in two to four short paragraphs or a short list, with no headings or tables.`,
    'My estimate below came from the site’s calculator. Quote its numbers, but don’t work out new amounts. For a what-if, point me to the "Try it yourself" step in the slides above, which re-runs the calculator.',
    '',
    summaryText(p, r),
    ...(recommendation ? ['The following educational recommendation was already validated by the site. Explain its fit and qualifications; do not choose a different policy or invent quotes.', recommendationSummary(recommendation)] : []),
    ']',
  ].join('\n')
}

// The backend takes up to 40 messages and wants the first and last from the user.
const MAX_SENT = 20

export function payload(log: Said[], p: Profile, r: Ready, recommendation?: Recommendation | null): Sent[] {
  let recent = log.slice(-MAX_SENT)
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1)
  return recent.map((m, i) => ({
    role: m.role,
    content: i === 0 ? `${context(p, r, recommendation)}\n\nMy question: ${m.text}` : m.text.slice(0, 8000),
  }))
}

// Streams Abe's reply from /api/chat; onText gets the reply so far. Returns null when the AI
// can't be reached or breaks off before saying anything. complete is false when it broke off
// partway through.
export async function askAI(messages: Sent[], onText: (text: string) => void, signal: AbortSignal):
Promise<{ text: string; complete: boolean } | null> {
  const ctrl = new AbortController()
  const stop = () => ctrl.abort()
  signal.addEventListener('abort', stop)
  // Give up if the server goes quiet for 15 seconds.
  let idle = setTimeout(stop, 15000)
  let text = ''
  let complete = false
  try {
    const body = new TextEncoder().encode(JSON.stringify({ messages }))
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-amz-content-sha256': await sha256(body) },
      body,
      signal: ctrl.signal,
    })
    if (!response.ok || !response.body) return null
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      clearTimeout(idle)
      idle = setTimeout(stop, 15000)
      const lines = (buffer + value).split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line)
        if (typeof event.delta === 'string') {
          text += event.delta
          onText(text)
        } else if (event.done) {
          complete = true
        } else if (event.error) {
          break
        }
      }
    }
  } catch {
    // Network error, timeout or a garbled line: keep whatever arrived.
  } finally {
    clearTimeout(idle)
    signal.removeEventListener('abort', stop)
  }
  return text.trim() ? { text, complete } : null
}
