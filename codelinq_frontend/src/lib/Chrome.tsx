// Shared page chrome: the top bar (section links on Home, step progress elsewhere).
import { useState, type ReactNode } from 'react'
import { Alert, Button, Icon, PartnerBadge } from '../kit/Kit.tsx'
import { go, resetState, type Route } from './store.ts'

const STEPS: { id: Route; label: string }[] = [
  { id: 'prepare', label: 'Basics' },
  { id: 'chat', label: 'Chat' },
  { id: 'review', label: 'Review' },
  { id: 'results', label: 'Results' },
]

function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function Brand() {
  return (
    <a className="brand headline" href="#/">
      <span className="brand__mark" aria-hidden="true"><Icon name="heart" size={18} weight={2.4} /></span>
      <span>Linq<span className="brand__accent">Life</span></span>
    </a>
  )
}

export function Header({ route }: { route: Route }) {
  const [confirming, setConfirming] = useState(false)
  const index = STEPS.findIndex((s) => s.id === route)
  return (
    <>
      <header className={'top' + (index < 0 ? ' top--home' : '')}>
        <Brand />
        {index >= 0
          ? <div className="top__actions">
              <Button variant="bordered" size="small" icon="chevron-left" onClick={() => go('home')}>Exit Assessment</Button>
              <Button variant="plain" size="small" onClick={() => setConfirming(true)}>Start Over</Button>
            </div>
          : (
            <nav className="top__nav" aria-label="Page sections">
              <button type="button" className="top__link" onClick={() => jump('how')}>How it works</button>
              <button type="button" className="top__link" onClick={() => jump('get')}>What you get</button>
              <Button size="small" onClick={() => go('prepare')}>Start Assessment</Button>
            </nav>
          )}
      </header>
      {index >= 0 && <Stepper index={index} />}
      <Alert
        open={confirming}
        title="Start over?"
        message="This clears your questionnaire draft and the current chat session."
        actions={[
          { label: 'Cancel', role: 'cancel', onClick: () => setConfirming(false) },
          { label: 'Start Over', role: 'destructive', onClick: () => { setConfirming(false); resetState(); go('home') } },
        ]}
      />
    </>
  )
}

function Stepper({ index }: { index: number }) {
  return (
    <nav className="stepper" aria-label="Progress">
      <ol>
        {STEPS.map((s, i) => (
          <li key={s.id} className={i < index ? 'is-done' : i === index ? 'is-current' : ''} aria-current={i === index ? 'step' : undefined}>
            <span className="stepper__mark" aria-hidden="true">{i < index && <Icon name="check" size={14} weight={3} />}</span>
            <span className="stepper__label">{s.label}{i < index && <span className="sr-only"> (done)</span>}</span>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Page({ className, children }: { className?: string; children: ReactNode }) {
  return <main className={'screen ' + (className ?? '')}>{children}</main>
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="screen__title">
      <h1 className="large-title">{children}</h1>
      {sub && <p className="body muted">{sub}</p>}
    </div>
  )
}

export function Footer() {
  return (
    <footer className="lp-footer">
      <p className="footnote muted">LinqLife gives an educational estimate, not a quote, a recommendation, or financial, legal, or tax advice. It doesn’t account for inflation, investment returns, taxes, or Social Security.</p>
      <PartnerBadge prefix="Built at" name="codeLinc 11" />
    </footer>
  )
}
