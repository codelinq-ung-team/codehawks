// Shared page chrome: the top bar (a brand bar with a chat link on Home, step progress elsewhere).
import { useState, type ReactNode } from 'react'
import { Alert, Button, Icon } from '../kit/Kit.tsx'
import { getState, go, resetState, type Route } from './store.ts'
import { GUIDE_NAME } from '../guide/guide.ts'

const STEPS: { id: Route; label: string }[] = [
  { id: 'prepare', label: 'Basics' },
  { id: 'chat', label: 'Chat' },
  { id: 'review', label: 'Review' },
  { id: 'results', label: 'Results' },
]

export function Brand() {
  return (
    <a className="brand headline" href="#/">
      <span className="brand__mark" aria-hidden="true"><Icon name="heart" size={18} weight={2.4} /></span>
      <span>Linc<span className="brand__accent">Life</span></span>
    </a>
  )
}

// Same destination as the hero's start button: back into the chat if it's under way.
function startChat() {
  const s = getState()
  go(s.started && s.messages.length ? 'chat' : 'prepare')
}

export function Header({ route }: { route: Route }) {
  const [confirming, setConfirming] = useState(false)
  const index = STEPS.findIndex((s) => s.id === route)
  return (
    <>
      <header className={'top' + (index < 0 ? ' top--home' : '')}>
        <Brand />
        {index >= 0
          ? <Button variant="plain" size="small" onClick={() => setConfirming(true)}>Start Over</Button>
          : (
            <button type="button" className="top__cta" onClick={startChat}>
              Chat with {GUIDE_NAME}<Icon name="chevron-right" size={14} weight={2.8} />
            </button>
          )}
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
