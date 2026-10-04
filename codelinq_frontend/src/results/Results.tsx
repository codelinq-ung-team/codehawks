// Results: the estimate, every term behind it, what-if controls and a summary to copy.
// Every number here comes from calculate(); the page does no math of its own.
import { useState } from 'react'
import { Banner, Button, EmptyState, ListRow, ListSection, StatCard } from '../kit/Kit.tsx'
import { Page, Title } from '../lib/Chrome.tsx'
import { go, setField, useStore } from '../lib/store.ts'
import { FIELDS, calculate, formatMoney, summaryText, type Estimate, type FieldId, type Profile } from '../domain/calculator.ts'

const listJoin = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

export function Results() {
  const { profile: p } = useStore()
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const unconfirmed = FIELDS.some((f) => f.role === 'required' && p[f.id].status !== 'confirmed')
  const result = calculate(p)

  if (unconfirmed || !result.ready) {
    return (
      <Page className="results">
        <EmptyState
          icon="check-circle"
          title="Let’s check your answers first"
          message="Once you’ve confirmed them, we’ll show your estimate and the math behind it."
          action={{ label: 'Review Answers', onClick: () => go('review') }}
        />
      </Page>
    )
  }

  const years = Number(p.years.value)
  const support = Number(p.support.value)

  function adjust(id: FieldId, delta: number, min: number, max: number) {
    setField(id, { status: 'confirmed', value: Math.min(max, Math.max(min, Number(p[id].value) + delta)) })
    setCopied(null)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(summaryText(p, result))
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }

  return (
    <Page className="results">
      <Title sub="Based on the answers you confirmed. Change any number below to see how it affects the estimate.">Your estimate</Title>

      <div className="results__grid">
        <div className="results__main">
          <StatCard
            tone="brand" value={formatMoney(result.additional)}
            label={result.additional > 0 ? 'Estimated additional coverage to consider' : 'No additional coverage needed for what you listed'}
          />
          <p className="body explain">{explain(p, result)}</p>

          <ListSection
            header="How we got there"
            footer={result.leftOut.length ? `Not included: ${result.leftOut.join(', ').toLowerCase()}.` : undefined}
          >
            {result.needs.filter((t) => t.included).map((t) => <ListRow key={t.id} title={t.label} subtitle={t.detail} value={`+ ${formatMoney(t.value)}`} />)}
            <ListRow title={<strong>What your family would need</strong>} value={<strong>{formatMoney(result.totalNeeds)}</strong>} />
            {result.resources.filter((t) => t.included).map((t) => <ListRow key={t.id} title={t.label} value={`− ${formatMoney(t.value)}`} />)}
            <ListRow title={<strong>Estimated additional coverage</strong>} value={<strong className="tint-text">{formatMoney(result.additional)}</strong>} />
          </ListSection>
        </div>

        <aside className="results__side">
          <ListSection header="Try a different scenario" footer="Changes here update your answers and your summary.">
            <Stepper
              label="Years of support" value={`${years} ${years === 1 ? 'year' : 'years'}`}
              dec={() => adjust('years', -1, 1, 70)} inc={() => adjust('years', 1, 1, 70)} canDec={years > 1} canInc={years < 70}
            />
            <Stepper
              label="Yearly support" value={formatMoney(support)}
              dec={() => adjust('support', -5000, 0, 10_000_000)} inc={() => adjust('support', 5000, 0, 10_000_000)} canDec={support > 0} canInc
            />
          </ListSection>

          <div className="stack">
            <Button size="large" fullWidth icon="share" onClick={() => void copy()}>Copy Summary</Button>
            {copied === 'ok' && <Banner tone="success" title="Summary copied" message="Paste it into a note or email to bring to a licensed professional." onDismiss={() => setCopied(null)} />}
            {copied === 'fail' && (
              <>
                <Banner tone="warning" title="We couldn’t copy that" message="Your browser blocked the clipboard. Select the text in the summary and copy it yourself." />
                <textarea className="summary-text" readOnly value={summaryText(p, result)} aria-label="Summary" onFocus={(e) => e.target.select()} />
              </>
            )}
            <Button variant="bordered" fullWidth onClick={() => go('review')}>Change My Answers</Button>
          </div>

          <ListSection header="Good to know">
            <ListRow icon="calendar" iconColor="orange" title="Term insurance" subtitle="Covers a set number of years. Often used for needs with an end date, like raising kids or paying off a mortgage." />
            <ListRow icon="shield" iconColor="teal" title="Permanent insurance" subtitle="Designed to last longer, and may include features beyond the death benefit, depending on the product." />
          </ListSection>
        </aside>
      </div>

      <p className="footnote muted limits">This is an estimate to help you start a conversation, not a quote or a recommendation. It doesn’t account for inflation, investment returns, taxes, or Social Security benefits.</p>
    </Page>
  )
}

function Stepper({ label, value, dec, inc, canDec, canInc }: {
  label: string; value: string; dec: () => void; inc: () => void; canDec: boolean; canInc: boolean
}) {
  return (
    <div className="ck-row stepper-row" role="listitem">
      <span className="ck-row__text">
        <span className="ck-row__title">{label}</span>
        <span className="ck-row__subtitle" aria-live="polite">{value}</span>
      </span>
      <span className="stepper-row__buttons">
        <Button variant="bordered" size="small" disabled={!canDec} onClick={dec} aria-label={`Decrease ${label.toLowerCase()}`}>−</Button>
        <Button variant="bordered" size="small" disabled={!canInc} onClick={inc} aria-label={`Increase ${label.toLowerCase()}`}>+</Button>
      </span>
    </div>
  )
}

function explain(p: Profile, r: Extract<Estimate, { ready: true }>) {
  const years = Number(p.years.value)
  const support = r.needs.find((t) => t.id === 'support')!
  const debts = r.needs.filter((t) => t.id !== 'support' && t.included && t.value > 0)
  let text = `You said your family would need ${formatMoney(Number(p.support.value))} a year for ${years} ${years === 1 ? 'year' : 'years'}, which comes to ${formatMoney(support.value)}.`
  if (debts.length) text += ` Adding ${listJoin(debts.map((t) => t.label.toLowerCase()))} brings the total to ${formatMoney(r.totalNeeds)}.`
  if (r.totalResources > 0) {
    text += ` You already have ${formatMoney(r.totalResources)} in coverage and savings, ` +
      (r.additional > 0 ? `so the gap is about ${formatMoney(r.additional)}.` : 'which covers the needs you listed.')
  } else if (r.additional > 0) {
    text += ' You don’t have coverage or savings counted yet, so the full amount is what to consider.'
  }
  if (r.additional === 0) text += ' That doesn’t mean every situation is covered. It’s worth checking again when life changes.'
  return text
}
