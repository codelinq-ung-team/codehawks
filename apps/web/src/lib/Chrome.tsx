// Shared page chrome: the brand bar (with Start Over during the steps), and step progress under it.
import { useState, type ReactNode } from 'react'
import { Alert, Button, Icon } from '../kit/Kit.tsx'
import { go, resetState, type Route } from './store.ts'

const STEPS: { id: Route; label: string }[] = [
  { id: 'prepare', label: 'Basics' },
  { id: 'chat', label: 'Chat' },
  { id: 'review', label: 'Review' },
  { id: 'results', label: 'Results' },
]

// Abe's face for the brand tile: an outlined stovepipe hat over a solid chin-curtain beard.
function AbeMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 8.5V2.3a.8.8 0 0 1 .8-.8h5.4a.8.8 0 0 1 .8.8v6.2M5 8.5h14" />
      <path d="M7.5 11.5c0 5.6 2 10 4.5 10s4.5-4.4 4.5-10c-.9 3.2-2.5 5-4.5 5s-3.6-1.8-4.5-5z" fill="currentColor" />
      <circle cx="10.2" cy="11.6" r=".95" fill="currentColor" stroke="none" />
      <circle cx="13.8" cy="11.6" r=".95" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function Brand() {
  return (
    <a className="brand headline" href="#/">
      <span className="brand__mark" aria-hidden="true"><AbeMark /></span>
      <span>Linc<span className="brand__accent">Life</span></span>
    </a>
  )
}

export function Header({ route }: { route: Route }) {
  const [confirming, setConfirming] = useState(false)
  // Choosing how to talk with Abe, and talking with him in VR, are both part of the Chat step.
  const step = route === 'mode' || route === 'vr' ? 'chat' : route
  const index = STEPS.findIndex((s) => s.id === step)
  return (
    <>
      <header className="top">
        <Brand />
        {index >= 0 && <Button size="small" icon="restart" className="top__restart" onClick={() => setConfirming(true)}>Start Over</Button>}
      </header>
      {index >= 0 && <Stepper index={index} />}
      <Alert
        open={confirming}
        title="Start over?"
        message="This clears your answers from this session."
        actions={[
          { label: 'Cancel', role: 'cancel', onClick: () => setConfirming(false) },
          { label: 'Start Over', role: 'destructive', onClick: () => { setConfirming(false); resetState(); go('home') } },
        ]}
      />
    </>
  )
}

function Stepper({ index }: { index: number }) {
  // Finished steps link back by route (answers live in the store, so nothing is lost);
  // the current step and later ones are plain text.
  return (
    <nav className="stepper" aria-label="Progress">
      <ol>
        {STEPS.map((s, i) => {
          const done = i < index
          const inner = (
            <>
              <span className="stepper__mark" aria-hidden="true">{done && <Icon name="check" size={14} weight={3} />}</span>
              <span className="stepper__label">{s.label}{done && <span className="sr-only"> (done, go back)</span>}</span>
            </>
          )
          return (
            <li key={s.id} className={done ? 'is-done' : i === index ? 'is-current' : ''} aria-current={i === index ? 'step' : undefined}>
              {done ? <a className="stepper__link" href={'#/' + s.id}>{inner}</a> : inner}
            </li>
          )
        })}
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
