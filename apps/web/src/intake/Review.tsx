// Review: every answer in one place. Tap to change. Only confirmed values reach the calculator.
import { useState } from 'react'
import { Banner, Button, ListRow, ListSection, Sheet, TextField } from '../kit/Kit.tsx'
import { Page, Title } from '../lib/Chrome.tsx'
import { go, setField, setState, useStore } from '../lib/store.ts'
import { CoveragePreferences } from './CoveragePreferences.tsx'
import {
  FIELD, FIELDS, GROUPS, HOUSEHOLD, PLANS, SUPPORT_ERROR, validSupport, formatField, missingRequired, parseAmount, parseCount,
  type Field, type FieldId, type Household,
} from '../domain/calculator.ts'

const HINT: Partial<Record<FieldId, string>> = {
  income: 'Yearly, before taxes.',
  support: 'Enter at least $1 per year. Many people use 70–80% of income.',
  years: 'How long the support should last, from 1 to 70 years.',
  youngestAge: 'In years. Use 0 for a baby.',
  mortgage: 'What’s left to pay. Enter 0 if you don’t have one.',
  otherDebts: 'Car loans, student loans, and credit cards. Enter 0 for none.',
  finalExpenses: 'An amount for funeral costs and final bills.',
  education: 'Education or another big future cost, in total.',
  existing: 'Through work or on your own. Enter 0 for none.',
  savings: 'Savings or investments your family could use.',
  futureIncome: 'A rough guess at your yearly income in about ten years. It never changes today’s estimate.',
}

const listJoin = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

export function Review() {
  const { profile } = useStore()
  const [editing, setEditing] = useState<FieldId | null>(null)
  const missing = missingRequired(profile)
  const showAge = ['kids', 'both'].includes(String(profile.household.value)) || profile.youngestAge.status !== 'empty'

  function confirmAll() {
    setState((s) => {
      const next = { ...s.profile }
      FIELDS.forEach((f) => {
        const field = next[f.id]
        if (field.status === 'proposed') next[f.id] = { ...field, status: 'confirmed' }
        else if (f.role === 'optional' && (field.status === 'empty' || field.status === 'unknown')) next[f.id] = { status: 'skipped', value: null }
      })
      return { profile: next }
    })
    go('results')
  }

  return (
    <Page className="review">
      <Title sub="Make sure everything looks right. Tap any answer to change it.">Check your answers</Title>

      <div className="review__grid">
        <div className="review__lists">
          {GROUPS.map((g) => (
            <ListSection key={g.id} header={g.title}>
              {FIELDS.filter((f) => f.group === g.id && (f.id !== 'youngestAge' || showAge)).map((f) => {
                const field = profile[f.id]
                const flagged = f.role === 'required' && missing.includes(f.id)
                return (
                  <ListRow
                    key={f.id}
                    title={f.label}
                    subtitle={f.id === 'support' && flagged && field.value != null ? SUPPORT_ERROR : f.role === 'optional' ? 'Optional' : f.role === 'context' ? 'Helps us ask better questions' : undefined}
                    value={<span className={flagged ? 'warn' : field.status === 'empty' ? 'tint-text' : ''}>{field.status === 'empty' ? 'Add' : formatField(f.id, field)}</span>}
                    onClick={() => setEditing(f.id)}
                  />
                )
              })}
            </ListSection>
          ))}
          <CoveragePreferences />
        </div>

        <aside className="review__side">
          {missing.length
            ? (
              <Banner
                tone="warning"
                title={missing.length === 1 ? 'One answer still needed' : `${missing.length} answers still needed`}
                message={`We need ${listJoin(missing.map((id) => FIELD[id].label.toLowerCase()))} before we can do the math. A good guess is fine.`}
                action={{ label: `Fill In ${FIELD[missing[0]].label}`, onClick: () => setEditing(missing[0]) }}
              />
            )
            : <Banner tone="success" title="Everything we need is here" message="Optional answers you leave blank won’t be counted." />}
          <Button size="large" fullWidth disabled={missing.length > 0} onClick={confirmAll} className="lift">Confirm & See Results</Button>
          <Button variant="bordered" fullWidth icon="chevron-left" onClick={() => go('chat')} className="lift lift--back">Back to Chat</Button>
        </aside>
      </div>

      {editing && <Editor key={editing} id={editing} field={profile[editing]} onClose={() => setEditing(null)} />}
    </Page>
  )
}

function Editor({ id, field, onClose }: { id: FieldId; field: Field; onClose: () => void }) {
  const def = FIELD[id]
  const [text, setText] = useState(field.value != null && def.kind !== 'choice' ? String(field.value) : '')
  const [error, setError] = useState('')

  const save = (next: Field) => { setField(id, next); onClose() }

  function saveText() {
    if (def.kind === 'money') {
      const r = parseAmount(text)
      if (r.kind !== 'amount') return setError(r.kind === 'negative' ? 'Amounts can’t be negative.' : 'Enter an amount, like 75,000 or 75k.')
      if (id === 'support' && !validSupport(r.value)) return setError(SUPPORT_ERROR)
      return save({ status: 'confirmed', value: r.value })
    }
    const [min, max] = def.kind === 'years' ? [1, 70] : [0, 30]
    const r = parseCount(text, min, max)
    if (r.kind !== 'amount') return setError(`Enter a number from ${min} to ${max}.`)
    save({ status: 'confirmed', value: r.value })
  }

  if (def.kind === 'choice') {
    return (
      <Sheet title={def.label} onClose={onClose}>
        <ListSection>
          {(Object.entries(HOUSEHOLD) as [Household, string][]).map(([v, label]) => (
            <ListRow key={v} title={label} accessory="check" checked={field.value === v} onClick={() => save({ status: 'confirmed', value: v })} />
          ))}
        </ListSection>
      </Sheet>
    )
  }

  if (def.kind === 'plans') return <PlansEditor field={field} title={def.label} onClose={onClose} save={save} />

  return (
    <Sheet title={def.label} onClose={onClose} action={{ label: 'Save', onClick: saveText }}>
      <form className="editor" onSubmit={(e) => { e.preventDefault(); saveText() }}>
        <TextField
          label={def.label} value={text} autoFocus
          inputMode={def.kind === 'money' ? 'decimal' : 'numeric'}
          placeholder={id === 'support' ? '$40,000' : def.kind === 'money' ? '$0' : '0'}
          helper={error ? undefined : HINT[id]} error={error || undefined}
          onChange={(v) => { setText(v); setError('') }}
        />
        <Button type="submit" size="large" fullWidth>Save</Button>
        <div className="editor__alt">
          <Button variant="bordered" onClick={() => save({ status: 'unknown', value: null })}>I’m Not Sure</Button>
          {def.role === 'optional' && <Button variant="bordered" onClick={() => save({ status: 'skipped', value: null })}>Leave It Out</Button>}
        </div>
      </form>
    </Sheet>
  )
}

// What the person expects in the next ten years: any of them, or none.
function PlansEditor({ field, title, onClose, save }: { field: Field; title: string; onClose: () => void; save: (next: Field) => void }) {
  const [value, setValue] = useState(typeof field.value === 'number' ? field.value : 0)
  const done = () => save({ status: 'confirmed', value })
  return (
    <Sheet title={title} onClose={onClose} action={{ label: 'Save', onClick: done }}>
      <ListSection footer="Pick any that fit, or none. This never changes today’s estimate.">
        {PLANS.map((p) => (
          <ListRow key={p.id} title={p.label} accessory="check" checked={(value & p.bit) !== 0} onClick={() => setValue(value ^ p.bit)} />
        ))}
      </ListSection>
      <div className="editor">
        <Button size="large" fullWidth onClick={done}>Save</Button>
        <div className="editor__alt">
          <Button variant="bordered" onClick={() => save({ status: 'skipped', value: null })}>Leave It Out</Button>
        </div>
      </div>
    </Sheet>
  )
}
