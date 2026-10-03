// Home: a short pitch, a preview of the chat with Abe, then the details further down.
import { useEffect, useState } from 'react'
import { Button, Icon, ListRow, ListSection, StatCard, type HueName, type IconName } from './kit/Kit.tsx'
import { Avatar } from './guide/Avatar.tsx'
import { GUIDE_NAME } from './guide/guide.ts'
import { Footer } from './lib/Chrome.tsx'
import { go, resetState, useStore } from './lib/store.ts'

// A short scripted exchange that shows how the chat works: ask, explain why, answer.
const DEMO: { role: 'bot' | 'user'; text: string; why?: boolean }[] = [
  { role: 'bot', text: `Hi, I’m ${GUIDE_NAME}! About how much do you earn in a year?` },
  { role: 'user', text: 'Why do you ask?' },
  { role: 'bot', why: true, text: 'It’s the paycheck your family would lose. It’s a starting point, not the final number.' },
  { role: 'user', text: 'Makes sense. About $75,000.' },
  { role: 'bot', text: 'Thanks! Next, let’s talk about any debts.' },
]

const STEPS: { icon: IconName; hue: HueName; title: string; text: string }[] = [
  { icon: 'info', hue: 'blue', title: 'Start with the basics', text: 'Five quick questions about your income, family, debts and coverage.' },
  { icon: 'people', hue: 'indigo', title: 'Chat in your own words', text: 'Ask “why?” any time. “Not sure” is always an answer.' },
  { icon: 'check-circle', hue: 'green', title: 'Check your answers', text: 'Fix anything before we do the math.' },
  { icon: 'trend-up', hue: 'orange', title: 'See the math', text: 'Try different numbers and copy a summary to keep.' },
]

export function Home() {
  const state = useStore()
  const resume = state.started
  const startLabel = resume ? 'Continue Where You Left Off' : 'Start Your Free Assessment'
  const start = () => go(resume ? (state.messages.length ? 'chat' : 'prepare') : 'prepare')

  return (
    <main className="lp">
      <section className="lp-hero" aria-labelledby="hero-title">
        <div className="lp-hero__copy">
          <h1 id="hero-title" className="lp-title">Life insurance,<br /><span className="lp-title__accent">made simple.</span></h1>
          <p className="lp-lede">Find out how much coverage your family may need in one friendly conversation. We explain every question and show you every number.</p>
          <div className="lp-cta">
            <Button size="large" onClick={start} className="lp-cta__btn">{startLabel}<Icon name="chevron-right" size={18} weight={2.6} /></Button>
            {resume
              ? <button type="button" className="link-button subhead" onClick={() => { resetState(); go('prepare') }}>Start fresh instead</button>
              : <span className="subhead muted">5 quick questions, then a short chat</span>}
          </div>
          <ul className="lp-trust">
            <li><Icon name="shield" size={22} /><span><strong>Private by design</strong><span>Questionnaire saved on this device</span></span></li>
            <li><Icon name="check-circle" size={22} /><span><strong>Educational guidance</strong><span>No account, nothing to buy</span></span></li>
          </ul>
        </div>
        <Preview onStart={start} />
      </section>

      <section className="lp-band" aria-label="At a glance">
        <ul>
          <li><strong>~10</strong> short questions</li>
          <li><strong>100%</strong> free</li>
          <li><strong>0</strong> accounts needed</li>
          <li><strong>1</strong> summary to keep</li>
        </ul>
      </section>

      <section className="lp-section" id="how" aria-labelledby="how-title">
        <div className="lp-section__head">
          <h2 id="how-title" className="lp-h2">How it works</h2>
          <p className="body muted">A calm, step-by-step chat. You stay in control of every answer.</p>
        </div>
        <ul className="lp-steps">
          {STEPS.map((s) => (
            <li key={s.title} className="lp-step">
              <span className="lp-step__tile" style={{ background: `var(--hue-${s.hue})` }} aria-hidden="true"><Icon name={s.icon} size={20} weight={2.2} /></span>
              <h3 className="headline">{s.title}</h3>
              <p className="subhead muted">{s.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="lp-section lp-get" id="get" aria-labelledby="get-title">
        <div className="lp-get__copy">
          <h2 id="get-title" className="lp-h2">An estimate you can actually follow</h2>
          <p className="body muted">No black box. You’ll see what goes in, what comes out, and how changing one number changes the result.</p>
          <ul className="lp-checks">
            {['Every line of the math, in plain language', 'Try different scenarios instantly', 'A summary to bring to a licensed professional'].map((t) => (
              <li key={t} className="body"><Icon name="check" size={18} weight={2.6} />{t}</li>
            ))}
          </ul>
        </div>
        <div className="lp-get__example">
          <StatCard tone="brand" value="$500,000" label="Estimated additional coverage for a sample family" />
          <ListSection footer="A sample household with one child. Your numbers will be different.">
            <ListRow title="Yearly support" subtitle="$40,000 × 10 years" value="$400,000" />
            <ListRow title="Mortgage and other debts" value="+ $180,000" />
            <ListRow title="Education" value="+ $20,000" />
            <ListRow title="Coverage you already have" value="− $100,000" />
          </ListSection>
        </div>
      </section>

      <section className="lp-final" aria-labelledby="final-title">
        <h2 id="final-title" className="lp-h2">Ready when you are</h2>
        <p className="body">It takes about 10 short questions. You can stop, go back, or start over any time.</p>
        <Button size="large" onClick={start} className="lp-final__btn">{startLabel}</Button>
      </section>

      <Footer />
    </main>
  )
}

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

// A preview of the chat with Abe. Messages appear one at a time, like the real thing.
function Preview({ onStart }: { onStart: () => void }) {
  const [shown, setShown] = useState(() => (reduceMotion() ? DEMO.length : 0))
  const typing = shown < DEMO.length && DEMO[shown].role === 'bot'

  useEffect(() => {
    if (shown >= DEMO.length) return
    const t = setTimeout(() => setShown(shown + 1), shown === 0 ? 700 : typing ? 1300 : 900)
    return () => clearTimeout(t)
  }, [shown, typing])

  return (
    <div className="lp-preview">
      <span className="lp-preview__blob" aria-hidden="true" />
      <span className="lp-preview__ring" aria-hidden="true" />
      <div className="lp-chat" role="group" aria-label={`Example conversation with ${GUIDE_NAME}`}>
        <div className="lp-chat__head">
          <Avatar size={128} className="lp-chat__face" label={`${GUIDE_NAME}, your guide`} />
          <strong className="lp-chat__name">{GUIDE_NAME}</strong>
          <span className="footnote muted"><span className="chat-card__dot" aria-hidden="true" />Your life insurance guide</span>
        </div>
        <ol className="lp-chat__log">
          {DEMO.slice(0, shown).map((m, i) => (
            <li key={i} className={`lp-msg lp-msg--${m.role}${m.why ? ' lp-msg--why' : ''}`}>
              {m.why && <span className="lp-msg__tag"><Icon name="info" size={12} />Why we ask</span>}
              {m.text}
            </li>
          ))}
          {typing && <li className="lp-msg lp-msg--bot msg--typing" aria-hidden="true"><span /><span /><span /></li>}
        </ol>
        <Button fullWidth onClick={onStart} className="lp-chat__cta">Chat with {GUIDE_NAME}<Icon name="chevron-right" size={16} weight={2.6} /></Button>
        <p className="lp-card__note caption-1"><Icon name="shield" size={13} />Questionnaire saved on this device</p>
      </div>
    </div>
  )
}
