// Before the chat: six short form questions, one at a time (same layout as the team's
// assessment form). Answers fill in the profile so Abe only asks the follow-ups. After the
// last one comes the choice between typing with Abe here and talking with him in VR.
// Abe stands beside each question in a pose.
// An optional Plaid step comes first; it can fill in income and debt. Then age starts the questions.
import { useState, type FormEvent } from 'react'
import { Button, Icon } from '../kit/Kit.tsx'
import { Page } from '../lib/Chrome.tsx'
import { go, setState, useStore, type Form } from '../lib/store.ts'
import { GUIDE_NAME } from '../guide/guide.ts'
import { GuidePose, type PoseName } from '../guide/Poses.tsx'
import { applyForm } from './script.ts'
import { ADULT_AGE_ERROR, validAdultAge } from './adultAge.ts'
import { PlaidConnect } from './PlaidConnect.tsx'
import { applyPlaid, debtFromPlaid, incomeFromPlaid, plaidFill } from './plaidFill.ts'

type Option = { label: string; value: Form[keyof Form] }
type Question = { id: keyof Form; prompt: string; helper: string; pose: PoseName; side: 'left' | 'right' } & (
  | { type: 'options'; options: Option[] }
  | { type: 'number'; money?: boolean; max: number; placeholder: string }
)

const QUESTIONS: Question[] = [
  {
    id: 'age', type: 'number', max: 120, placeholder: '35', pose: 'wave', side: 'left',
    prompt: 'How old are you?',
    helper: 'This assessment is for adults aged 18 or older. Include children as household dependents.',
  },
  {
    id: 'income', type: 'number', money: true, max: 100_000_000, placeholder: '75,000', pose: 'wave', side: 'left',
    prompt: 'What is your yearly income?',
    helper: 'Before taxes. A rough number is fine.',
  },
  {
    id: 'marital', type: 'options', pose: 'point', side: 'left',
    prompt: 'What is your marital status?',
    helper: 'Choose Married if you share a household with a partner.',
    options: [{ label: 'Single', value: 'single' }, { label: 'Married', value: 'married' }],
  },
  {
    id: 'dependents', type: 'number', max: 20, placeholder: '0', pose: 'think', side: 'left',
    prompt: 'How many dependents do you have?',
    helper: 'Children, or anyone else who relies on your income. Enter 0 if no one does.',
  },
  {
    id: 'debt', type: 'number', money: true, max: 100_000_000, placeholder: '180,000', pose: 'clipboard', side: 'right',
    prompt: 'What is your current total debt?',
    helper: `Include your mortgage, car loans, student loans and credit cards. ${GUIDE_NAME} will ask how much of it is the mortgage.`,
  },
  {
    id: 'coverage', type: 'options', pose: 'thumbs', side: 'right',
    prompt: 'Do you currently have life insurance?',
    helper: 'Include any coverage through work.',
    options: [{ label: 'Yes', value: true }, { label: 'No', value: false }],
  },
]

const digits = (text: string) => text.replace(/\D/g, '').slice(0, 9)

export function Prepare() {
  const { form, plaid } = useStore()
  // The Basics form always opens on the Plaid step; it shows what's connected, or offers to connect.
  const [connecting, setConnecting] = useState(true)
  const [index, setIndex] = useState(0)
  const q = QUESTIONS[index]
  const answer = form[q.id]
  const last = index === QUESTIONS.length - 1
  // Counts the question on screen; the bar is full on the last question.
  const progress = Math.round(((index + 1) / QUESTIONS.length) * 100)
  const tooBig = q.type === 'number' && typeof answer === 'number' && answer > q.max
  const ageInvalid = q.id === 'age' && !validAdultAge(answer)
  const invalid = tooBig || ageInvalid
  // Abe cheers once the last question is answered.
  const pose: PoseName = last && answer != null ? 'cheer' : q.pose
  const fromPlaid = (q.id === 'income' && incomeFromPlaid(form, plaid)) || (q.id === 'debt' && debtFromPlaid(form, plaid))

  const save = (value: Form[keyof Form]) => setState((s) => ({ form: { ...s.form, [q.id]: value } }))

  function next() {
    if (last) {
      setState((s) => ({ profile: applyPlaid(applyForm(s).profile ?? s.profile, s.form, s.plaid), started: true }))
      go('mode')
    } else {
      setIndex(index + 1)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (answer != null && !invalid) next()
  }

  // Skipping leaves the answer empty, never zero.
  function skip() {
    save(null)
    next()
  }

  if (connecting) return <PlaidConnect onDone={() => setConnecting(false)} />

  return (
    <Page className="qform-screen">
      <form className="qform" onSubmit={submit} aria-labelledby="q-heading" noValidate>
        <div className="qform__meta"><span>Basics · Question {index + 1} of {QUESTIONS.length}</span></div>
        <div
          className="qform__bar" role="progressbar" aria-label="Basics progress"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`Question ${index + 1} of ${QUESTIONS.length}`}
        ><span style={{ width: `${progress}%` }} /></div>

        <div className="qform__body" key={q.id} data-side={q.side}>
          <div className="qform__head">
            <span className="qform__num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <GuidePose key={pose} name={pose} className="qform__guide" />
          </div>
          <h1 id="q-heading" className="qform__prompt">{q.prompt}</h1>
          <p className="qform__helper" id="q-helper">{q.helper}</p>

          {q.type === 'options' && (
            <div className="qform__options" role="radiogroup" aria-labelledby="q-heading" aria-describedby="q-helper">
              {q.options.map((o) => {
                const on = answer === o.value
                return (
                  <button
                    key={o.label} type="button" role="radio" aria-checked={on}
                    className={'qform__option' + (on ? ' is-on' : '')} onClick={() => save(o.value)}
                  >
                    <span>{o.label}</span>
                    <i aria-hidden="true">{on && <Icon name="check" size={14} weight={3} />}</i>
                  </button>
                )
              })}
            </div>
          )}

          {q.type === 'number' && (
            <>
              <div className={'qform__input' + (invalid && answer != null ? ' is-error' : '')}>
                {q.money && <span className="qform__prefix" aria-hidden="true">$</span>}
                <input
                  type="text" inputMode="numeric" autoComplete="off" autoFocus
                  aria-labelledby="q-heading" aria-describedby={invalid && answer != null ? 'q-helper q-error' : 'q-helper'} aria-invalid={invalid && answer != null || undefined}
                  placeholder={q.placeholder}
                  value={typeof answer === 'number' ? (q.money ? answer.toLocaleString('en-US') : String(answer)) : ''}
                  onChange={(e) => {
                    const text = e.target.value
                    if (q.id === 'age' && !/^\d*$/.test(text)) return
                    const d = q.id === 'age' ? text : digits(text)
                    save(d === '' ? null : Number(d))
                  }}
                />
              </div>
              {fromPlaid && (
                <p className="qform__filled"><Icon name="check-circle" size={16} />
                  Filled in from {plaid?.environment === 'sample' ? 'sample accounts' : 'your Plaid accounts'} ({plaidFill(plaid)?.accounts} connected). Change it if it’s off.
                </p>
              )}
              {invalid && answer != null && <p id="q-error" className="qform__error" role="alert"><Icon name="exclamation" size={15} />{q.id === 'age' ? ADULT_AGE_ERROR : `Please enter a number up to ${q.max.toLocaleString('en-US')}.`}</p>}
              {q.id !== 'age' && <button type="button" className="link-button subhead qform__skip" onClick={skip}>
                {`Not sure? Skip, and ${GUIDE_NAME} will ask later`}
              </button>}
            </>
          )}
        </div>

        <div className="qform__actions">
          <Button variant="bordered" onClick={() => index === 0 ? setConnecting(true) : setIndex(index - 1)}>Back</Button>
          <Button type="submit" disabled={answer == null || invalid}>
            {last ? `Meet ${GUIDE_NAME}` : 'Continue'}<Icon name="chevron-right" size={18} weight={2.6} />
          </Button>
        </div>
      </form>
    </Page>
  )
}
