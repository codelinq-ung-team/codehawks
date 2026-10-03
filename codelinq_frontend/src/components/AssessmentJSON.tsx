import { useState } from 'react'
import type { AssessmentAnswersJSON } from '../domain/assessment.ts'
import { Button } from '../kit/Kit.tsx'

export function AssessmentJSON({ result }: { result: AssessmentAnswersJSON }) {
  const [status, setStatus] = useState('')
  const json = JSON.stringify(result, null, 2)
  async function copy() {
    try {
      await navigator.clipboard.writeText(json)
      setStatus('JSON copied.')
    } catch {
      setStatus('Select and copy the JSON below.')
    }
  }
  return (
    <details className="assessment-json">
      <summary className="headline">View complete assessment JSON</summary>
      <p className="footnote muted">Your questionnaire answers and their descriptions, ready for the next conversation.</p>
      <Button variant="bordered" size="small" onClick={() => void copy()}>Copy JSON</Button>
      <span className="footnote" role="status">{status}</span>
      <pre>{json}</pre>
    </details>
  )
}
