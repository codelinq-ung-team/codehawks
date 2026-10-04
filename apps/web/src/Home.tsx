// Home: a short pitch and a preview of the chat with Abe.
import { useEffect, useState } from 'react'
import { Button, Icon } from './kit/Kit.tsx'
import { Avatar } from './guide/Avatar.tsx'
import { GUIDE_NAME } from './guide/guide.ts'
import { go, resetState, useStore } from './lib/store.ts'
import { nextStep } from './intake/script.ts'

// A short scripted exchange that shows how the chat works: ask, explain why, answer.
const DEMO: { role: 'bot' | 'user'; text: string; why?: boolean }[] = [
  { role: 'bot', text: `Hi, I’m ${GUIDE_NAME}! About how much do you earn in a year?` },
  { role: 'user', text: 'Why do you ask?' },
  { role: 'bot', why: true, text: 'It’s the paycheck your family would lose. It’s a starting point, not the final number.' },
  { role: 'user', text: 'Makes sense. About $75,000.' },
  { role: 'bot', text: 'Thanks! Next, let’s talk about any debts.' },
]

export function Home() {
  const state = useStore()
  const resume = state.started
  const startLabel = resume ? 'Continue Where You Left Off' : 'Start Your Free Assessment'
  // Back to wherever they were: the text chat, the headset pairing, or (answers back from VR) Review.
  const start = () => go(!resume ? 'prepare' : state.messages.length ? 'chat' : state.vr ? 'vr' : nextStep(state) ? 'prepare' : 'review')

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
            <li><Icon name="shield" size={22} /><span><strong>Private by design</strong><span>No account, and nothing is saved</span></span></li>
            <li><Icon name="check-circle" size={22} /><span><strong>Educational guidance</strong><span>No account, nothing to buy</span></span></li>
          </ul>
        </div>
        <Preview onStart={start} />
      </section>

      <footer className="lp-band" />
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
        <p className="lp-card__note caption-1"><Icon name="shield" size={13} />Your answers aren’t saved</p>
      </div>
    </div>
  )
}
