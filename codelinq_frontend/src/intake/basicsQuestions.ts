import type { PoseName } from '../guide/Poses.tsx'
import { GUIDE_NAME } from '../guide/guide.ts'
import type { Form } from '../lib/store.ts'

export type Option = { label: string; value: Form[keyof Form] }
export type Question = { id: keyof Form; prompt: string; helper: string; pose: PoseName; side: 'left' | 'right' } & (
  | { type: 'options'; options: Option[] }
  | { type: 'number'; money?: boolean; max: number; placeholder: string }
)

export const QUESTIONS: Question[] = [
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

export function questionsForBasics(hasPlaid: boolean): Question[] {
  return hasPlaid ? QUESTIONS.filter(({ id }) => id !== 'income' && id !== 'debt') : QUESTIONS
}
