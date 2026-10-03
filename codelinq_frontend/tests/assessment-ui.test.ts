// Exercise the actual questionnaire handlers and JSON renderer without a browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { assessmentQuestions } from '../src/data/assessmentQuestions.ts'
import type { AssessmentAnswersJSON } from '../src/domain/assessment.ts'

type Element = {
  type: unknown
  props: {
    children?: unknown
    type?: string
    inputMode?: string
    disabled?: boolean
    result?: AssessmentAnswersJSON
    onChange?: (event: { target: { value: string } }) => void
    onClick?: () => void
    onSubmit?: (event: { preventDefault: () => void }) => void
  }
}

function nodes(value: unknown): Element[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!('type' in value) || !('props' in value)) return []
  const element = value as Element
  return [element, ...nodes(element.props.children)]
}

function mount(file: string, props: Record<string, unknown>, storage: Map<string, string>) {
  const url = new URL(file, import.meta.url)
  const require = createRequire(url)
  const states: unknown[] = []
  let cursor = 0
  const exports: Record<string, (props: Record<string, unknown>) => unknown> = {}
  const output = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  runInNewContext(output, {
    exports, crypto: globalThis.crypto,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    require: (name: string) => {
      if (name.endsWith('.css')) return {}
      if (name === 'react') return {
        useState: (initial: unknown) => {
          const index = cursor++
          if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
          return [states[index], (value: unknown) => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
        },
      }
      if (name.endsWith('/Kit.tsx')) return { Button: 'Button', Icon: 'Icon', EmptyState: 'EmptyState' }
      if (name.endsWith('/Chrome.tsx')) return { Page: 'Page', Title: 'Title' }
      if (name.endsWith('/Poses.tsx')) return { GuidePose: 'GuidePose' }
      if (name.endsWith('/AssessmentJSON.tsx')) return { AssessmentJSON: 'AssessmentJSON' }
      return require(name)
    },
  })
  return () => {
    cursor = 0
    return (exports.default ?? exports.AssessmentJSON)(props)
  }
}

test('Justin-styled questionnaire preserves typed answers and renders all final descriptions', () => {
  const storage = new Map<string, string>()
  let completed: AssessmentAnswersJSON | undefined
  const render = mount('../src/components/AssessmentPage.tsx', {
    questions: assessmentQuestions,
    onComplete: (result: AssessmentAnswersJSON) => { completed = result },
  }, storage)
  const responses = [45000, 'Single', 3, 500000, 'Yes']
  for (const [index, q] of assessmentQuestions.entries()) {
    let tree = render()
    const input = nodes(tree).find((node) => node.type === 'input')
    if (q.type === 'number-input') {
      assert.equal(input?.props.type, 'text')
      assert.equal(input?.props.inputMode, 'numeric')
      input?.props.onChange?.({ target: { value: String(responses[index]) + 'abc' } })
    } else {
      const option = nodes(tree).find((node) => node.type === 'button' && nodes(node.props.children).some((child) => Array.isArray(child.props.children) && child.props.children[0] === responses[index]))
      assert.ok(option)
      option.props.onClick?.()
    }
    tree = render()
    const submit = nodes(tree).find((node) => node.type === 'Button' && node.props.type === 'submit')
    assert.equal(submit?.props.disabled, false)
    assert.ok(!JSON.stringify(tree).includes(q.description))
    nodes(tree).find((node) => node.type === 'form')?.props.onSubmit?.({ preventDefault() {} })
  }
  assert.ok(completed)
  assert.deepEqual(JSON.parse(JSON.stringify(completed.answers)), {
    income: 45000, 'marital-status': 'Single', 'number-of-dependents': 3,
    debt: 500000, 'current-coverage': 'Yes',
  })
  const output = nodes(render()).find((node) => node.type === 'AssessmentJSON')
  assert.equal(output?.props.result, completed)
  const renderJSON = mount('../src/components/AssessmentJSON.tsx', { result: completed }, storage)
  const displayed = nodes(renderJSON()).find((node) => node.type === 'pre')?.props.children
  assert.equal(typeof displayed, 'string')
  assert.ok(typeof displayed === 'string')
  assert.deepEqual(JSON.parse(displayed), JSON.parse(JSON.stringify(completed)))
  assert.deepEqual(JSON.parse(storage.get('linqlife-assessment-answers')!), JSON.parse(displayed))
  for (const q of assessmentQuestions) assert.equal(JSON.parse(displayed).questionDescriptions[q.id], q.description)
})
