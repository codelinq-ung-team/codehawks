// "What Abe knows": the panel beside the chat listing imported Plaid context and
// every answer Abe has so far, with a way to disconnect or take information back.
// New cards fly up and fade in as Abe learns them.
import { useEffect, useRef } from 'react'
import { FIELDS, formatField, formatMoney, type FieldId, type Profile } from '../domain/calculator.ts'
import { ThinkingAbe } from '../guide/Poses.tsx'
import { GUIDE_NAME } from '../guide/guide.ts'
import { Icon } from '../kit/Kit.tsx'
import type { FinancialSnapshot, Form } from '../lib/store.ts'

type FactBase = {
  label: string
  value: string
  unsure: boolean
}

export type Fact =
  | (FactBase & { kind: 'field'; id: FieldId })
  | (FactBase & { kind: 'form'; id: keyof Form })
  | (FactBase & { kind: 'plaid'; id: string })

// Basics answers are listed in the order the form asks them.
const BASICS_ORDER = ['income', 'marital', 'dependents', 'household', 'debt', 'mortgage', 'otherDebts', 'coverage', 'existing']
const YEARLY: FieldId[] = ['income', 'support']

function currency(value: number, code: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: code, maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${Math.round(value).toLocaleString('en-US')} ${code}`
  }
}

function plaidFacts(snapshot: FinancialSnapshot | null): Fact[] {
  if (!snapshot) return []
  const imported: Fact[] = [{
    kind: 'plaid', id: 'plaid-accounts', label: 'Plaid connected accounts',
    value: `${snapshot.accounts.length} Sandbox ${snapshot.accounts.length === 1 ? 'account' : 'accounts'}`,
    unsure: true,
  }]
  for (const [code, totals] of Object.entries(snapshot.totalsByCurrency).sort(([a], [b]) => a.localeCompare(b))) {
    imported.push(
      { kind: 'plaid', id: `plaid-${code}-liquid`, label: `Plaid liquid assets (${code})`, value: currency(totals.liquidAssets, code), unsure: true },
      { kind: 'plaid', id: `plaid-${code}-investments`, label: `Plaid investments (${code})`, value: currency(totals.investmentAssets, code), unsure: true },
      { kind: 'plaid', id: `plaid-${code}-debt`, label: `Plaid listed debt (${code})`, value: currency(totals.debtBalances, code), unsure: true },
    )
  }
  return imported
}

function facts(profile: Profile, form: Form, snapshot: FinancialSnapshot | null): Fact[] {
  const has = (id: FieldId) => profile[id].status !== 'empty'
  const basics: Fact[] = []
  const chat: Fact[] = []
  // Form answers the chat doesn't store as a field of its own.
  const fromForm = (id: keyof Form, label: string, value: string) => basics.push({ kind: 'form', id, label, value, unsure: false })
  if (form.marital) fromForm('marital', 'Marital status', form.marital === 'married' ? 'Married' : 'Single')
  if (form.dependents != null) fromForm('dependents', 'Dependents', String(form.dependents))
  if (form.debt && !(has('mortgage') && has('otherDebts'))) fromForm('debt', 'Total debt', formatMoney(form.debt))
  if (form.coverage && !has('existing')) fromForm('coverage', 'Has life insurance', 'Yes')

  for (const f of FIELDS) {
    const field = profile[f.id]
    if (field.status === 'empty') continue
    const known = field.status === 'proposed' || field.status === 'confirmed'
    const fact: Fact = {
      kind: 'field', id: f.id, label: f.label,
      value: formatField(f.id, field) + (known && YEARLY.includes(f.id) ? '/yr' : ''),
      unsure: !known,
    }
    ;(field.source === 'form' ? basics : chat).push(fact)
  }
  basics.sort((a, b) => BASICS_ORDER.indexOf(a.id) - BASICS_ORDER.indexOf(b.id))
  return [...plaidFacts(snapshot), ...basics, ...chat]
}

export function Knows({ profile, form, snapshot, busy, onForget }: {
  profile: Profile; form: Form; snapshot: FinancialSnapshot | null; busy: boolean; onForget: (fact: Fact) => void
}) {
  const list = facts(profile, form, snapshot)
  const listRef = useRef<HTMLUListElement>(null)
  const count = useRef(list.length)
  // When Abe learns something new, scroll the newest card into view.
  useEffect(() => {
    const el = listRef.current
    if (el && list.length > count.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    count.current = list.length
  }, [list.length])
  return (
    <aside className="knows" aria-labelledby="knows-title">
      <div className="knows__head">
        <ThinkingAbe size={192} className="knows__abe" />
        <h2 id="knows-title" className="knows__title">What {GUIDE_NAME} knows</h2>
      </div>
      <ul className="knows__list" ref={listRef}>
        {list.map((f) => (
          <li key={f.kind + f.id} className={'knows__card' + (f.unsure ? ' is-unsure' : '')}>
            <span className="knows__mark" aria-hidden="true"><Icon name={f.unsure ? 'info' : 'check-circle'} size={26} weight={1.8} /></span>
            <span className="knows__text">
              <span className="knows__label">{f.label}</span>
              <strong className="knows__value">{f.value}</strong>
            </span>
            <button
              type="button" className="knows__forget" disabled={busy} onClick={() => onForget(f)}
              aria-label={f.kind === 'plaid' ? 'Disconnect Plaid data' : `Remove ${f.label}`}
              title={f.kind === 'plaid' ? 'Disconnect Plaid data' : undefined}
            >
              <Icon name="xmark" size={18} weight={2.2} />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
