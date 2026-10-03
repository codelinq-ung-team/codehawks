import type { AssessmentQuestion } from '../components/AssessmentPage'

// Add, remove, or reorder questions in this array. The AssessmentPage component
// supports options, number-input, and text question types.
// description is model context included in the saved JSON; helperText is shown to users.
export const assessmentQuestions: AssessmentQuestion[] = [
  {
    id: 'income',
    type: 'number-input',
    prompt: 'What is your yearly income?',
    description: 'The user\'s reported personal income per year, not monthly income or combined household income. The question does not specify currency or whether income is gross or take-home. Clarify these details before calculating support needs; this amount is not automatically the income survivors would need replaced.',
    helperText: '',
    placeholder: 'Enter a number',
    required: true,
  },
  {
    id: 'marital-status',
    type: 'options',
    prompt: 'What is your marital status?',
    description: 'The user\'s self-reported marital status, selected from Single or Married. Married does not establish spouse income or financial dependence. Single does not establish that the user has no partner or dependents. Ask relevant follow-up questions about household support.',
    helperText: '',
    required: true,
    options: [
      { value: 'Single', label: 'Single', description: '' },
      { value: 'Married', label: 'Married', description: '' },
    ],
  },
  {
    id: 'number-of-dependents',
    type: 'number-input',
    prompt: 'How many dependents do you have?',
    description: 'The user\'s reported number of dependents. This count does not identify their relationships, ages, financial support amounts, or how long support is needed, and should not be interpreted as a count of children only. Clarify who is included and their support needs.',
    helperText: '',
    placeholder: 'Enter a number',
    required: true,
  },
  {
    id: 'debt',
    type: 'number-input',
    prompt: 'What is your current total debt?',
    description: 'Total outstanding non-mortgage personal debt, including credit card debt, student loans, car loans, and other personal loans. Explicitly excludes mortgage debt and rent. This is a balance, not a monthly payment amount. Currency, debt ownership, co-signers, and repayment goals are not established. Assess housing obligations separately and do not assume survivors personally owe every debt.',
    helperText: 'Your total debt does not include your mortgage or rent. Please include credit card debt, student loans, car loans, and any other personal loans.',
    placeholder: 'Enter a number',
    required: true,
  },
  {
    id: 'current-coverage',
    type: 'options',
    prompt: 'Do you currently have life insurance?',
    description: 'Whether the user reports having any current life insurance, answered Yes or No. Yes does not establish coverage amount, policy type, policy duration, employer versus individual coverage, or portability. Obtain those details before subtracting existing coverage from the estimated need.',
    helperText: '',
    required: true,
    options: [
      { value: 'Yes', label: 'Yes', description: '' },
      { value: 'No', label: 'No', description: '' },
    ],
  }
]
