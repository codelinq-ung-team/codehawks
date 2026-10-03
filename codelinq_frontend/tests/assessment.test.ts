import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessmentQuestions } from '../src/data/assessmentQuestions.ts'
import { createAssessment, completeAssessment, restoreAssessment } from '../src/domain/assessment.ts'
import { assessmentToForm } from '../src/intake/assessmentAdapter.ts'

test('the public contract keeps all five IDs, value types, and descriptions', () => {
  const result = createAssessment(assessmentQuestions)
  result.answers = {
    income: 45000, 'marital-status': 'Single', 'number-of-dependents': 3,
    debt: 500000, 'current-coverage': 'Yes',
  }
  const final = JSON.parse(JSON.stringify(completeAssessment(result, assessmentQuestions)))
  assert.deepEqual(Object.keys(final).sort(), [
    'version', 'assessmentId', 'startedAt', 'updatedAt', 'answers', 'questionDescriptions',
  ].sort())
  assert.deepEqual(final.answers, result.answers)
  assert.equal(final.assessmentId, result.assessmentId)
  assert.equal(final.startedAt, result.startedAt)
  for (const q of assessmentQuestions) assert.equal(final.questionDescriptions[q.id], q.description)
  assert.match(final.questionDescriptions.debt, /excludes mortgage debt and rent/i)
  assert.deepEqual(assessmentToForm(final), {
    income: 45000, marital: 'single', dependents: 3, debt: 500000, coverage: true,
  })
  // Mapping into Justin's internal model must not change the external payload.
  assert.equal(final.answers['current-coverage'], 'Yes')
  assert.equal(final.answers['marital-status'], 'Single')
})

test('old drafts retain answers and identity, refresh descriptions, and drop placeholders', () => {
  const draft = {
    version: 1, assessmentId: 'original', startedAt: 'original-start', updatedAt: 'original-update',
    answers: { income: 0, debt: 0, 'placeholder-question': 'sample-a' },
  }
  const result = restoreAssessment(JSON.stringify(draft), assessmentQuestions)
  assert.deepEqual(result.answers, { income: 0, debt: 0 })
  assert.equal(result.assessmentId, 'original')
  assert.equal(result.startedAt, 'original-start')
  assert.equal(Object.keys(result.questionDescriptions).length, 5)
  assert.equal(assessmentToForm(result).income, 0)
  assert.equal(assessmentToForm(result).coverage, null)
})

test('invalid stored JSON starts a fresh assessment without crashing', () => {
  for (const raw of ['{broken', 'null', '{}']) {
    const result = restoreAssessment(raw, assessmentQuestions)
    assert.deepEqual(result.answers, {})
    assert.equal(result.version, 1)
    assert.ok(result.assessmentId)
  }
})
