import type { AssessmentAnswersJSON } from '../domain/assessment.ts'
import type { Form } from '../lib/store.ts'

// Justin's internal chat model is separate from the public questionnaire JSON.
// In this integration, Form.debt always excludes the mortgage.
export function assessmentToForm(result: AssessmentAnswersJSON): Form {
  const a = result.answers
  const number = (id: string) => typeof a[id] === 'number' && Number.isFinite(a[id]) ? a[id] as number : null
  return {
    income: number('income'),
    marital: a['marital-status'] === 'Married' ? 'married' : a['marital-status'] === 'Single' ? 'single' : null,
    dependents: number('number-of-dependents'),
    debt: number('debt'),
    coverage: a['current-coverage'] === 'Yes' ? true : a['current-coverage'] === 'No' ? false : null,
  }
}
