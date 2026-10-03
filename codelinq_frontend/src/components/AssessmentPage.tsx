import { useState, type FormEvent } from 'react'
import {
  ASSESSMENT_STORAGE_KEY, completeAssessment, restoreAssessment,
  type AssessmentAnswer, type AssessmentAnswersJSON, type AssessmentQuestion,
} from '../domain/assessment.ts'
import { Button, EmptyState, Icon } from '../kit/Kit.tsx'
import { Page, Title } from '../lib/Chrome.tsx'
import { GUIDE_NAME } from '../guide/guide.ts'
import { GuidePose, type PoseName } from '../guide/Poses.tsx'
import { AssessmentJSON } from './AssessmentJSON.tsx'
import './AssessmentPage.css'

// Retain the original import location for question authors and existing consumers.
export type { AssessmentAnswer, AssessmentOption, AssessmentQuestion, AssessmentAnswersJSON } from '../domain/assessment.ts'

type AssessmentPageProps = {
  questions: AssessmentQuestion[]
  storageKey?: string
  title?: string
  onExit?: () => void
  onComplete?: (result: AssessmentAnswersJSON) => void
  onContinue?: () => void
}

const POSES: PoseName[] = ['wave', 'point', 'think', 'clipboard', 'thumbs']

export default function AssessmentPage({
  questions, storageKey = ASSESSMENT_STORAGE_KEY, title = 'Your needs assessment',
  onExit, onComplete, onContinue,
}: AssessmentPageProps) {
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState(() => {
    try { return restoreAssessment(localStorage.getItem(storageKey), questions) }
    catch { return restoreAssessment(null, questions) }
  })
  const [isComplete, setIsComplete] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const q = questions[index]
  const answer = q ? result.answers[q.id] : undefined
  const last = index === questions.length - 1
  const hasAnswer = Array.isArray(answer) ? answer.length > 0 : answer !== undefined && answer !== ''
  const invalidNumber = q?.type === 'number-input' && hasAnswer && (
    typeof answer !== 'number' || !Number.isSafeInteger(answer) || answer < (q.min ?? 0)
    || answer > (q.max ?? Number.MAX_SAFE_INTEGER)
  )
  const canContinue = (!q?.required || hasAnswer) && !invalidNumber
  const pose = last && hasAnswer ? 'cheer' : POSES[index % POSES.length]

  function persist(next: AssessmentAnswersJSON) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
      setStorageError(false)
    } catch { setStorageError(true) }
    setResult(next)
  }

  function save(value: AssessmentAnswer) {
    persist(completeAssessment({ ...result, answers: { ...result.answers, [q.id]: value } }, questions))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!canContinue) return
    if (!last) { setIndex(index + 1); return }
    const completed = completeAssessment(result, questions)
    persist(completed)
    setIsComplete(true)
    onComplete?.(completed)
  }

  if (!q) {
    return <Page><EmptyState title="No questions yet" message="Add questions to the assessment configuration." action={onExit ? { label: 'Return Home', onClick: onExit } : undefined} /></Page>
  }

  if (isComplete) {
    return (
      <Page className="assessment-finished">
        <GuidePose name="cheer" className="assessment-finished__guide" />
        <Title sub="Your basics are ready. You can review the complete questionnaire JSON below.">Your assessment is ready</Title>
        {storageError && <p role="status">Your browser couldn't save a copy. Copy the JSON before leaving this page.</p>}
        <AssessmentJSON result={result} />
        <div className="assessment-finished__actions">
          <Button variant="bordered" onClick={() => setIsComplete(false)}>Edit Answers</Button>
          {onContinue && <Button onClick={onContinue}>Start Chat with {GUIDE_NAME}<Icon name="chevron-right" size={18} /></Button>}
          {onExit && <Button variant="bordered" onClick={onExit}>Exit Assessment</Button>}
        </div>
      </Page>
    )
  }

  return (
    <Page className="qform-screen">
      <form className="qform" onSubmit={submit} aria-label={title} noValidate>
        <div className="qform__meta"><span>Question {index + 1} of {questions.length}</span><span>{Math.round(((index + 1) / questions.length) * 100)}% complete</span></div>
        <div className="qform__bar" aria-hidden="true"><span style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
        <div className="qform__body" key={q.id} data-side={index % POSES.length < 3 ? 'left' : 'right'}>
          <div className="qform__head">
            <span className="qform__num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <GuidePose key={pose} name={pose} className="qform__guide" />
          </div>
          <h1 id="q-heading" className="qform__prompt">{q.prompt}</h1>
          {q.helperText && <p className="qform__helper" id="q-helper">{q.helperText}</p>}

          {q.type === 'options' && (
            <div className="qform__options" role="group" aria-labelledby="q-heading">
              {q.options.map((option) => {
                const selected = q.allowMultiple ? Array.isArray(answer) && answer.includes(option.value) : answer === option.value
                return (
                  <button
                    key={option.value} type="button" aria-pressed={selected}
                    className={'qform__option' + (selected ? ' is-on' : '')}
                    onClick={() => {
                      const values = Array.isArray(answer) ? answer : []
                      save(q.allowMultiple ? selected ? values.filter((value) => value !== option.value) : [...values, option.value] : option.value)
                    }}
                  >
                    <span>{option.label}{option.description && <small className="assessment-option-description">{option.description}</small>}</span>
                    <i aria-hidden="true">{selected && <Icon name="check" size={14} weight={3} />}</i>
                  </button>
                )
              })}
            </div>
          )}

          {q.type === 'number-input' && (
            <>
              <div className={'qform__input' + (invalidNumber ? ' is-error' : '')}>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" autoFocus
                  aria-labelledby="q-heading" aria-describedby={q.helperText ? 'q-helper' : undefined}
                  aria-invalid={invalidNumber || undefined} placeholder={q.placeholder}
                  value={typeof answer === 'number' ? String(answer) : ''}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, '')
                    if (digits === '' || Number.isSafeInteger(Number(digits))) save(digits === '' ? '' : Number(digits))
                  }}
                />
              </div>
              {invalidNumber && <p className="qform__error" role="alert">Enter a whole number from {q.min ?? 0} to {q.max ?? Number.MAX_SAFE_INTEGER}.</p>}
            </>
          )}

          {q.type === 'text' && (
            <textarea
              className="summary-text assessment-text" aria-labelledby="q-heading"
              placeholder={q.placeholder} value={typeof answer === 'string' ? answer : ''}
              onChange={(event) => save(event.target.value)}
            />
          )}
        </div>
        {storageError && <p role="status" className="footnote warn">Your answers are available here, but this browser couldn't save them for later.</p>}
        <div className="qform__actions">
          <Button variant="bordered" disabled={index === 0} className={index === 0 ? 'is-hidden' : ''} onClick={() => setIndex(index - 1)}>Back</Button>
          <Button type="submit" disabled={!canContinue}>{last ? 'Save Assessment' : 'Continue'}<Icon name="chevron-right" size={18} weight={2.6} /></Button>
        </div>
      </form>
    </Page>
  )
}
