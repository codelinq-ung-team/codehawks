// Before the chat: what we'll ask about and why, plus a few yes/no questions that tailor it.
// Topics follow the sections of Lincoln Financial's online needs calculator.
import { useState } from 'react'
import { Button, Icon, type HueName, type IconName } from '../kit/Kit.tsx'
import { Page, Title } from '../lib/Chrome.tsx'
import { go, setState, useStore, type Flags } from '../lib/store.ts'
import { applyQuickStart } from './script.ts'

const TOPICS: { icon: IconName; hue: HueName; title: string; ask: string; why: string; handy: string }[] = [
  {
    icon: 'people', hue: 'indigo', title: 'Your household',
    ask: 'Who depends on your income, and how old your youngest child is.',
    why: 'Life insurance is for the people who rely on you. Their needs shape everything else.',
    handy: 'Your kids’ ages',
  },
  {
    icon: 'house', hue: 'blue', title: 'Income your family would need',
    ask: 'What you earn, how much your family would need each year, and for how many years.',
    why: 'This is usually the biggest part. It replaces your paycheck so daily life can go on.',
    handy: 'A recent pay stub or tax return',
  },
  {
    icon: 'calendar', hue: 'orange', title: 'Debts and final costs',
    ask: 'What’s left on your mortgage, other loans and cards, and funeral costs.',
    why: 'Paying these off means your family isn’t left with bills or monthly payments.',
    handy: 'Your latest mortgage and loan statements',
  },
  {
    icon: 'gift', hue: 'purple', title: 'Future goals',
    ask: 'Big costs you’d want covered, like your kids’ education.',
    why: 'These are costs your family would face later, even without your income.',
    handy: 'A rough idea is fine',
  },
  {
    icon: 'shield', hue: 'green', title: 'What you already have',
    ask: 'Life insurance through work or on your own, and savings your family could use.',
    why: 'What you already have counts toward the total, so you don’t buy more than you need.',
    handy: 'Your benefits portal or policy papers',
  },
]

const QUICK: { id: keyof Flags; q: string }[] = [
  { id: 'partner', q: 'Do you have a partner or spouse?' },
  { id: 'kids', q: 'Do you have children?' },
  { id: 'mortgage', q: 'Do you have a mortgage?' },
  { id: 'coverage', q: 'Do you have any life insurance now, including through work?' },
]

export function Prepare() {
  const { flags } = useStore()
  const [open, setOpen] = useState<number | null>(null)

  const setFlag = (id: keyof Flags, v: boolean) =>
    setState((s) => ({ flags: { ...s.flags, [id]: s.flags[id] === v ? null : v } }))

  function start() {
    setState((s) => ({ ...applyQuickStart(s), started: true }))
    go('chat')
  }

  return (
    <Page className="prepare">
      <Title sub="Here’s what we’ll talk about and why it matters. Have these handy if you can, but a good guess is fine.">Before we chat</Title>

      <div className="prepare__grid">
        <section aria-labelledby="topics-title">
          <h2 id="topics-title" className="section-title headline">What we’ll ask about</h2>
          <ul className="topics">
            {TOPICS.map((t, i) => (
              <li key={t.title} className="topic">
                <span className="topic__tile" style={{ background: `var(--hue-${t.hue})` }} aria-hidden="true"><Icon name={t.icon} size={20} weight={2.2} /></span>
                <div className="topic__body">
                  <h3 className="headline">{t.title}</h3>
                  <p className="subhead muted">{t.ask}</p>
                  <p className="footnote topic__handy"><Icon name="check" size={14} weight={2.6} />Handy to have: {t.handy}</p>
                  <button type="button" className="link-button subhead" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                    {open === i ? 'Hide why it matters' : 'Why it matters'}
                  </button>
                  {open === i && <p className="subhead topic__why">{t.why}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="quick" aria-labelledby="quick-title">
          <div className="quick__card">
            <h2 id="quick-title" className="headline">A few quick questions</h2>
            <p className="subhead muted">Optional. Your answers help us skip questions that don’t apply to you.</p>
            <div className="quick__list">
              {QUICK.map((q) => (
                <fieldset key={q.id} className="quick__item">
                  <legend className="body">{q.q}</legend>
                  <div className="choice">
                    {([['Yes', true], ['No', false]] as const).map(([label, v]) => (
                      <button
                        key={label} type="button" aria-pressed={flags[q.id] === v}
                        className={'choice__btn' + (flags[q.id] === v ? ' is-on' : '')} onClick={() => setFlag(q.id, v)}
                      >
                        {flags[q.id] === v && <Icon name="check" size={16} weight={2.6} />}{label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <Button size="large" fullWidth onClick={start}>Start Chat</Button>
            <p className="footnote muted center">You can say “not sure” to anything.</p>
          </div>
        </aside>
      </div>
    </Page>
  )
}
