import { useState, type FormEvent } from 'react'
import { GuidePose, type PoseName } from '../guide/Poses.tsx'
import { GUIDE_NAME } from '../guide/guide.ts'
import { Button, Icon } from '../kit/Kit.tsx'
import { Page } from '../lib/Chrome.tsx'
import { go, setState, useStore, type Form } from '../lib/store.ts'
import { questionsForBasics } from './basicsQuestions.ts'
import { applyForm } from './script.ts'

const digits = (text: string) => text.replace(/\D/g, '').slice(0, 9)

export function BasicsQuiz({ hasPlaid }: { hasPlaid: boolean }) {
  const { form } = useStore()
  const [index, setIndex] = useState(0)
  const questions = questionsForBasics(hasPlaid)
  const question = questions[index]
  const answer = form[question.id]
  const last = index === questions.length - 1
  const progress = Math.round(((index + 1) / questions.length) * 100)
  const tooBig = question.type === 'number' && typeof answer === 'number' && answer > question.max
  const pose: PoseName = last && answer != null ? 'cheer' : question.pose

  const save = (value: Form[keyof Form]) => setState((state) => ({ form: { ...state.form, [question.id]: value } }))

  function next() {
    if (last) {
      setState((state) => ({ ...applyForm(state), started: true }))
      go('chat')
    } else {
      setIndex(index + 1)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (answer != null && !tooBig) next()
  }

  function skip() {
    save(null)
    next()
  }

  return (
    <Page className="qform-screen">
      <form className="qform" onSubmit={submit} aria-labelledby="q-heading" noValidate>
        <div className="qform__meta"><span>Basics · Question {index + 1} of {questions.length}</span></div>
        <div
          className="qform__bar" role="progressbar" aria-label="Basics progress"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`Question ${index + 1} of ${questions.length}`}
        ><span style={{ width: `${progress}%` }} /></div>

        <div className="qform__body" key={question.id} data-side={question.side}>
          <div className="qform__head">
            <span className="qform__num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <GuidePose key={pose} name={pose} className="qform__guide" />
          </div>
          <h1 id="q-heading" className="qform__prompt">{question.prompt}</h1>
          <p className="qform__helper" id="q-helper">{question.helper}</p>

          {question.type === 'options' && (
            <div className="qform__options" role="radiogroup" aria-labelledby="q-heading" aria-describedby="q-helper">
              {question.options.map((option) => {
                const selected = answer === option.value
                return (
                  <button
                    key={option.label} type="button" role="radio" aria-checked={selected}
                    className={'qform__option' + (selected ? ' is-on' : '')} onClick={() => save(option.value)}
                  >
                    <span>{option.label}</span>
                    <i aria-hidden="true">{selected && <Icon name="check" size={14} weight={3} />}</i>
                  </button>
                )
              })}
            </div>
          )}

          {question.type === 'number' && (
            <>
              <div className={'qform__input' + (tooBig ? ' is-error' : '')}>
                {question.money && <span className="qform__prefix" aria-hidden="true">$</span>}
                <input
                  type="text" inputMode="numeric" autoComplete="off" autoFocus
                  aria-labelledby="q-heading" aria-describedby="q-helper" aria-invalid={tooBig || undefined}
                  placeholder={question.placeholder}
                  value={typeof answer === 'number' ? (question.money ? answer.toLocaleString('en-US') : String(answer)) : ''}
                  onChange={(event) => { const value = digits(event.target.value); save(value === '' ? null : Number(value)) }}
                />
              </div>
              {tooBig && <p className="qform__error" role="alert"><Icon name="exclamation" size={15} />Please enter a number up to {question.max.toLocaleString('en-US')}.</p>}
              <button type="button" className="link-button subhead qform__skip" onClick={skip}>Not sure? Skip, and {GUIDE_NAME} will ask later</button>
            </>
          )}
        </div>

        <div className="qform__actions">
          <Button variant="bordered" className={index === 0 ? 'is-hidden' : ''} onClick={() => setIndex(index - 1)}>Back</Button>
          <Button type="submit" disabled={answer == null || tooBig}>
            {last ? `Start Chat with ${GUIDE_NAME}` : 'Continue'}<Icon name="chevron-right" size={18} weight={2.6} />
          </Button>
        </div>
      </form>
    </Page>
  )
}
