// Justin's Basics UI, driven by the team's canonical questions and JSON contract.
import AssessmentPage from '../components/AssessmentPage.tsx'
import { assessmentQuestions } from '../data/assessmentQuestions.ts'
import { emptyProfile } from '../domain/calculator.ts'
import { go, setState } from '../lib/store.ts'
import { assessmentToForm } from './assessmentAdapter.ts'
import { applyForm } from './script.ts'

export function Prepare() {
  return (
    <AssessmentPage
      questions={assessmentQuestions}
      onExit={() => go('home')}
      onComplete={(assessment) => {
        // A new questionnaire submission starts a fresh follow-up conversation so
        // old confirmed profile values cannot override revised basics.
        setState((current) => {
          const next = {
            ...current, assessment, form: assessmentToForm(assessment),
            profile: emptyProfile(), messages: [], pending: null, typing: false, started: true,
          }
          return { ...next, ...applyForm(next) }
        })
      }}
      onContinue={() => go('chat')}
    />
  )
}
