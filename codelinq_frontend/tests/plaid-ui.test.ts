import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

type Call = { path: string; options: { body: Uint8Array; headers: Record<string, string> } }

function loadApi(replies: Array<{ ok: boolean; body: unknown }>) {
  const url = new URL('../src/intake/plaid.ts', import.meta.url)
  const exports: Record<string, (...args: never[]) => unknown> = {}
  const calls: Call[] = []
  const source = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(source, {
    exports,
    crypto: webcrypto,
    TextEncoder,
    Uint8Array,
    AbortSignal,
    Error,
    fetch: async (path: string, options: Call['options']) => {
      calls.push({ path, options })
      const reply = replies.shift()
      if (!reply) throw new Error('Unexpected request')
      return { ok: reply.ok, json: async () => reply.body }
    },
  })
  return { exports, calls }
}

test('Plaid screen uses the real Link hook and backend helpers', () => {
  const source = readFileSync(new URL('../src/intake/Prepare.tsx', import.meta.url), 'utf8')
  assert.match(source, /usePlaidLink/)
  assert.match(source, /requestLinkToken/)
  assert.match(source, /exchangePublicToken/)
  assert.match(source, /user_good/)
  assert.doesNotMatch(source, /Simulate sign in|demo_password|UI-only Plaid/)
})

test('Plaid is optional and skipping clears imported context before chat', () => {
  const source = readFileSync(new URL('../src/intake/Prepare.tsx', import.meta.url), 'utf8')
  assert.match(source, /Continue without Plaid/)
  assert.match(source, /function continueWithoutPlaid/)
  assert.match(source, /financialSnapshot: null, financialContextToken: null, started: true/)
  assert.match(source, /Plaid Sandbox is optional/)
})

test('What Abe knows includes redacted Plaid summaries and disconnects their context together', () => {
  const knows = readFileSync(new URL('../src/intake/Knows.tsx', import.meta.url), 'utf8')
  const chat = readFileSync(new URL('../src/intake/Chat.tsx', import.meta.url), 'utf8')
  assert.match(knows, /Plaid connected accounts/)
  assert.match(knows, /Plaid liquid assets/)
  assert.match(knows, /Plaid investments/)
  assert.match(knows, /Plaid listed debt/)
  assert.match(chat, /snapshot=\{state\.financialSnapshot\}/)
  assert.match(chat, /financialSnapshot: null, financialContextToken: null/)
})

test('Plaid API helper creates a Link token then exchanges a public token', async () => {
  const snapshot = { source: 'plaid_accounts_get', accounts: [], totalsByCurrency: {} }
  const { exports, calls } = loadApi([
    { ok: true, body: { link_token: 'link-sandbox', expiration: 'soon' } },
    { ok: true, body: { connected: true, financialSnapshot: snapshot, financialContextToken: 'signed' } },
  ])
  assert.equal(await exports.requestLinkToken(), 'link-sandbox')
  assert.deepEqual(await exports.exchangePublicToken('public-sandbox'), {
    connected: true, financialSnapshot: snapshot, financialContextToken: 'signed',
  })
  assert.deepEqual(calls.map((call) => call.path), ['/api/plaid/link-token', '/api/plaid/exchange'])
  assert.deepEqual(calls.map((call) => JSON.parse(new TextDecoder().decode(call.options.body))),
                   [{}, { public_token: 'public-sandbox' }])
  assert.ok(calls.every((call) => /^[a-f0-9]{64}$/.test(call.options.headers['x-amz-content-sha256'])))
})

test('Plaid API helper surfaces sanitized backend errors', async () => {
  const { exports } = loadApi([{ ok: false, body: { error: 'Configure Plaid Sandbox credentials on the server.' } }])
  await assert.rejects(() => exports.requestLinkToken(), /Configure Plaid Sandbox credentials/)
})
