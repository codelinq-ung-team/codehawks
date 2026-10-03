import { useState, type ReactNode } from 'react'
import './AssessmentPage.css'

export type AssessmentAnswer = string | string[] | number

export type AssessmentOption = {
  value: string
  label: string
  description?: string
}

type QuestionBase = {
  id: string
  prompt: string
  helperText?: string
  required?: boolean
}

export type AssessmentQuestion = QuestionBase & (
  | { type: 'single-select'; options: AssessmentOption[] }
  | { type: 'multi-select'; options: AssessmentOption[] }
  | { type: 'text'; placeholder?: string }
  | { type: 'number'; placeholder?: string; min?: number; max?: number }
)

export type AssessmentAnswersJSON = {
  version: 1
  assessmentId: string
  startedAt: string
  updatedAt: string
  answers: Record<string, AssessmentAnswer>
}

type AssessmentPageProps = {
  questions: AssessmentQuestion[]
  storageKey?: string
  title?: string
  onExit?: () => void
  onComplete?: (result: AssessmentAnswersJSON) => void
}

const createAssessment = (): AssessmentAnswersJSON => ({
  version: 1,
  assessmentId: crypto.randomUUID(),
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  answers: {},
})

const loadAssessment = (storageKey: string) => {
  try {
    const saved = window.localStorage.getItem(storageKey)
    return saved ? JSON.parse(saved) as AssessmentAnswersJSON : createAssessment()
  } catch {
    return createAssessment()
  }
}

function AssessmentIcon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
}

export default function AssessmentPage({
  questions,
  storageKey = 'linqlife-assessment-answers',
  title = 'Your needs assessment',
  onExit,
  onComplete,
}: AssessmentPageProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [result, setResult] = useState<AssessmentAnswersJSON>(() => loadAssessment(storageKey))
  const [isComplete, setIsComplete] = useState(false)

  const question = questions[currentIndex]
  const answer = question ? result.answers[question.id] : undefined
  const progress = questions.length ? Math.round(((currentIndex + 1) / questions.length) * 100) : 0
  const canContinue = !question?.required || (Array.isArray(answer) ? answer.length > 0 : answer !== undefined && answer !== '')

  const saveAnswer = (questionId: string, value: AssessmentAnswer) => {
    setResult((current) => {
      const next = {
        ...current,
        updatedAt: new Date().toISOString(),
        answers: { ...current.answers, [questionId]: value },
      }
      window.localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }

  const toggleMultiSelect = (questionId: string, value: string) => {
    const currentValues = Array.isArray(result.answers[questionId]) ? result.answers[questionId] as string[] : []
    saveAnswer(questionId, currentValues.includes(value) ? currentValues.filter((item) => item !== value) : [...currentValues, value])
  }

  const goNext = () => {
    if (!canContinue) return
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((current) => current + 1)
      return
    }

    const completedResult = { ...result, updatedAt: new Date().toISOString() }
    window.localStorage.setItem(storageKey, JSON.stringify(completedResult))
    setResult(completedResult)
    setIsComplete(true)
    onComplete?.(completedResult)
  }

  if (!question) {
    return (
      <main className="assessment-empty">
        <h1>No questions yet</h1>
        <p>Add a question to the array passed into the assessment component.</p>
        {onExit && <button onClick={onExit}>Return home</button>}
      </main>
    )
  }

  if (isComplete) {
    return (
      <main className="assessment-complete">
        <div className="complete-mark">✓</div>
        <span className="assessment-kicker">ASSESSMENT SAVED</span>
        <h1>Your response is stored.</h1>
        <p>The component has saved the answers as JSON in local storage and passed the same object to the completion callback.</p>
        <details>
          <summary>View saved response JSON</summary>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </details>
        <button className="assessment-primary" onClick={onExit}>Return home</button>
      </main>
    )
  }

  return (
    <div className="assessment-page">
      <header className="assessment-header">
        <button className="assessment-brand" onClick={onExit} aria-label="Return to LinqLife home">
          <span className="assessment-brand-mark">
            <AssessmentIcon><path d="M20.8 5.8a5.4 5.4 0 0 0-7.6 0L12 7l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z" /></AssessmentIcon>
          </span>
          <span>Linq<strong>Life</strong></span>
        </button>
        <div className="assessment-header-title">{title}</div>
        <div className="assessment-save-state"><span /> Saved locally</div>
      </header>

      <main className="assessment-main">
        <aside className="assessment-guide">
          <button className="assessment-back-link" onClick={onExit}>
            <AssessmentIcon><path d="m15 18-6-6 6-6" /></AssessmentIcon>
            Exit Assessment
          </button>
        </aside>

        <section className="question-panel" aria-labelledby="question-heading">
          <div className="question-meta"><span>Question {currentIndex + 1} of {questions.length}</span><span>{progress}% complete</span></div>
          <div className="question-progress"><span style={{ width: `${progress}%` }} /></div>
          <div className="question-content">
            <span className="question-number">{String(currentIndex + 1).padStart(2, '0')}</span>
            <h2 id="question-heading">{question.prompt}</h2>
            {question.helperText && <p>{question.helperText}</p>}

            {(question.type === 'single-select' || question.type === 'multi-select') && (
              <div className="assessment-options">
                {question.options.map((option) => {
                  const isSelected = question.type === 'multi-select'
                    ? Array.isArray(answer) && answer.includes(option.value)
                    : answer === option.value
                  return (
                    <button
                      className={isSelected ? 'selected' : ''}
                      key={option.value}
                      onClick={() => question.type === 'multi-select' ? toggleMultiSelect(question.id, option.value) : saveAnswer(question.id, option.value)}
                      aria-pressed={isSelected}
                    >
                      <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
                      <i>{isSelected ? '✓' : ''}</i>
                    </button>
                  )
                })}
              </div>
            )}

            {question.type === 'text' && (
              <textarea value={typeof answer === 'string' ? answer : ''} placeholder={question.placeholder} onChange={(event) => saveAnswer(question.id, event.target.value)} />
            )}

            {question.type === 'number' && (
              <input type="number" value={typeof answer === 'number' ? answer : ''} placeholder={question.placeholder} min={question.min} max={question.max} onChange={(event) => saveAnswer(question.id, event.target.value === '' ? '' : event.target.valueAsNumber)} />
            )}
          </div>

          <div className="question-actions">
            <button className="assessment-secondary" disabled={currentIndex === 0} onClick={() => setCurrentIndex((current) => current - 1)}>Back</button>
            <button className="assessment-primary" disabled={!canContinue} onClick={goNext}>{currentIndex === questions.length - 1 ? 'Save assessment' : 'Continue'} <span>→</span></button>
          </div>
        </section>
      </main>
    </div>
  )
}
