import type { AssessmentQuestion } from '../components/AssessmentPage'

// Add, remove, or reorder questions in this array. The AssessmentPage component
// supports options, number-input, and text question types.
export const assessmentQuestions: AssessmentQuestion[] = [
  {
    id: 'current-coverage',
    type: 'options',
    prompt: 'Do you currently have life insurance?',
    helperText: '',
    required: true,
    options: [
      { value: 'Yes', label: 'Yes', description: '' },
      { value: 'No', label: 'No', description: '' },
    ],
  },
  {
    id: 'number-of-dependents',
    type: 'number-input',
    prompt: 'How many dependents do you have?',
    helperText: '',
    placeholder: 'Enter a number',
    required: true,
  },
  {
    id: 'marital-status',
    type: 'options',
    prompt: 'What is your marital status?',
    helperText: '',
    required: true,
    options: [
      { value: 'Single', label: 'Single', description: '' },
      { value: 'Married', label: 'Married', description: '' },
    ],
  },
  {
    id: 'income',
    type: 'number-input',
    prompt: 'What is your yearly income?',
    helperText: '',
    placeholder: 'Enter a number',
    required: true,
  },
  {
    id: 'debt',
    type: 'number-input',
    prompt: 'What is your current total debt?',
    helperText: '',
    placeholder: 'Enter a number',
    required: true,
  },
]
