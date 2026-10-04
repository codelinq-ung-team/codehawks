// Ask Abe on the results page: written answers, the offline fallback, and what goes to the AI.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculate, emptyProfile, type Field, type FieldId, type Profile } from '../src/domain/calculator.ts'
import { payload, topicFor, written, type Ready, type Said } from '../src/results/ask.ts'

const ok = (value: Field['value']): Field => ({ status: 'confirmed', value })

function sample(overrides: Partial<Record<FieldId, Field>> = {}): { p: Profile; r: Ready } {
  const p: Profile = {
    ...emptyProfile(),
    household: ok('both'), youngestAge: ok(4), income: ok(85000), support: ok(40000), years: ok(10),
    mortgage: ok(150000), otherDebts: ok(30000), education: ok(20000), existing: ok(100000),
    ...overrides,
  }
  const r = calculate(p)
  assert.ok(r.ready)
  return { p, r }
}

test('written answers quote numbers from the calculator', () => {
  const { p, r } = sample()
  assert.equal(r.additional, 500000)
  const years = written('years', p, r)
  assert.match(years, /\$40,000 a year for 10 years/)
  assert.match(years, /\$400,000/)
  assert.match(years, /youngest would be 14/)
  assert.match(written('term', p, r), /mortgage shrinks/)
})

test('written answers leave out what the user did not share', () => {
  const { p, r } = sample({ mortgage: ok(0), household: ok('none'), youngestAge: { status: 'empty', value: null } })
  assert.doesNotMatch(written('term', p, r), /mortgage/)
  assert.doesNotMatch(written('years', p, r), /youngest would be/)
  assert.match(written('leftOut', p, r), /didn’t give amounts for funeral and final expenses and savings your family could use/)
})

test('typed questions find a written answer when the AI is down', () => {
  assert.equal(topicFor('Should I get whole life instead?'), 'term')
  assert.equal(topicFor('How many years should my term be?'), 'term')
  assert.equal(topicFor('Does this include inflation?'), 'leftOut')
  assert.equal(topicFor('Where do I get a quote'), 'next')
  assert.equal(topicFor('Why so many years?'), 'years')
  assert.equal(topicFor('Can my dog be a beneficiary?'), null)
})

test('the first question sent carries Abe and the estimate', () => {
  const { p, r } = sample()
  const sent = payload([{ role: 'user', text: 'Is $500k a lot?' }], p, r)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].role, 'user')
  assert.match(sent[0].content, /You are Abe/)
  assert.match(sent[0].content, /Estimated additional coverage: \$500,000/)
  assert.match(sent[0].content, /My question: Is \$500k a lot\?$/)
})

test('long chats are trimmed and still start with the user', () => {
  const { p, r } = sample()
  const log: Said[] = Array.from({ length: 45 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` }))
  const sent = payload(log, p, r)
  assert.ok(sent.length <= 20)
  assert.equal(sent[0].role, 'user')
  assert.equal(sent[sent.length - 1].content, 'm44')
  assert.match(sent[0].content, /You are Abe/)
  assert.equal(sent.filter((m) => m.content.includes('You are Abe')).length, 1)
})

test('questions about the future get the outlook, or a pointer to add one', () => {
  assert.equal(topicFor('what if I get a raise?'), 'future')
  assert.equal(topicFor('we are planning to have kids'), 'future')
  const { p, r } = sample()
  assert.match(written('future', p, r), /snapshot of your life today/)
  const planned = sample({ futureIncome: ok(170000), plans: ok(2) })
  const text = written('future', planned.p, planned.r)
  assert.match(text, /Today’s estimate is \$500,000\. From the changes you expect, it could be about \$1,260,000 in 10 years\./)
  assert.match(text, /\*\*A higher income\*\*: \+\$400,000/)
  assert.match(text, /\*\*A home\*\*: \+\$360,000/)
  // The AI is told the same thing, so it explains the site's projection and doesn't make its own.
  assert.match(payload([{ role: 'user', text: 'What about later?' }], planned.p, planned.r)[0].content, /Looking ahead \(about 10 years/)
})
