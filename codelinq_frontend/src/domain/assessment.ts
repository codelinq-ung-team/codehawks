// Public questionnaire contract. Keep answer IDs and values stable for the LLM.
export type AssessmentAnswer = string | string[] | number
export type AssessmentOption = { value: string; label: string; description?: string }
type QuestionBase = {
  id: string
  prompt: string
  /** Context for the model, not displayed beside the question. */
  description: string
  helperText?: string
  required?: boolean
}
export type AssessmentQuestion = QuestionBase & (
  | { type: 'options'; options: AssessmentOption[]; allowMultiple?: boolean }
  | { type: 'number-input'; placeholder?: string; min?: number; max?: number }
  | { type: 'text'; placeholder?: string }
)
export type AssessmentAnswersJSON = {
  version: 1
  assessmentId: string
  startedAt: string
  updatedAt: string
  answers: Record<string, AssessmentAnswer>
  questionDescriptions: Record<string, string>
}

export const ASSESSMENT_STORAGE_KEY = 'linqlife-assessment-answers'

export function describeQuestions(questions: AssessmentQuestion[]): Record<string, string> {
  return Object.fromEntries(questions.map(({ id, description }) => [id, description]))
}

export function createAssessment(questions: AssessmentQuestion[]): AssessmentAnswersJSON {
  const now = new Date().toISOString()
  return {
    version: 1, assessmentId: crypto.randomUUID(), startedAt: now, updatedAt: now,
    answers: {}, questionDescriptions: describeQuestions(questions),
  }
}

export function restoreAssessment(raw: string | null, questions: AssessmentQuestion[]): AssessmentAnswersJSON {
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed.version !== 1 || typeof parsed.assessmentId !== 'string'
        || typeof parsed.startedAt !== 'string' || typeof parsed.updatedAt !== 'string'
        || !parsed.answers || typeof parsed.answers !== 'object' || Array.isArray(parsed.answers)) {
        return createAssessment(questions)
      }
      const answers = Object.fromEntries(Object.entries(parsed.answers).filter(([id, value]) =>
        !id.startsWith('placeholder-') && (
          typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
          || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
        ),
      )) as Record<string, AssessmentAnswer>
      return {
        version: 1, assessmentId: parsed.assessmentId, startedAt: parsed.startedAt,
        updatedAt: parsed.updatedAt, answers, questionDescriptions: describeQuestions(questions),
      }
    } catch { /* Invalid drafts start fresh. */ }
  }
  return createAssessment(questions)
}

export function completeAssessment(result: AssessmentAnswersJSON, questions: AssessmentQuestion[]): AssessmentAnswersJSON {
  return { ...result, updatedAt: new Date().toISOString(), questionDescriptions: describeQuestions(questions) }
}
