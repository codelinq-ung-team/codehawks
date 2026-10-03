import type { AssessmentQuestion } from '../components/AssessmentPage'

// Add, remove, or reorder questions in this array. The AssessmentPage component
// supports: single-select, multi-select, text, and number question types.
export const assessmentQuestions: AssessmentQuestion[] = [
  {
    id: 'placeholder-question',
    type: 'single-select',
    prompt: 'This is a placeholder question. Which sample answer would you choose?',
    helperText: 'Replace this object with your first real assessment question when you are ready.',
    required: true,
    options: [
      { value: 'sample-a', label: 'Sample answer A', description: 'Optional supporting text can go here.' },
      { value: 'sample-b', label: 'Sample answer B', description: 'Each option needs a unique value.' },
      { value: 'sample-c', label: 'Sample answer C' },
    ],
  },
]
