import { ListRow, ListSection } from '../kit/Kit.tsx'
import { COVERAGE_MATH_EXPLANATION, FUNDS_MATH_EXPLANATION, formatMathMoney, formatMoney, fundsAfterCosts, type Ready } from '../domain/calculator.ts'

export function FullMath({ r }: { r: Ready }) {
  const funds = fundsAfterCosts(r)
  const support = r.needs.find((t) => t.id === 'support')!
  return (
    <div className="wrap__math stack" aria-label="The full math">
      <h2 className="title-3">The full math</h2>
      <ListSection header="How much additional coverage?" footer={COVERAGE_MATH_EXPLANATION}>
        {r.needs.filter((t) => t.included).map((t) => <ListRow key={t.id} title={t.label} subtitle={t.detail} value={formatMathMoney(t.value, '+')} />)}
        <ListRow title={<strong>What your family would need</strong>} value={<strong>{formatMoney(r.totalNeeds)}</strong>} />
        {r.resources.filter((t) => t.included).map((t) => <ListRow key={t.id} title={t.label} value={formatMathMoney(t.value, '−')} />)}
        <ListRow title={<strong>Estimated additional coverage</strong>} value={<strong className="tint-text">{formatMoney(r.additional)}</strong>} />
      </ListSection>

      <p className="footnote muted">{FUNDS_MATH_EXPLANATION}</p>
      <ListSection header="After setting aside costs">
        {r.resources.filter((t) => t.included).map((t) => <ListRow key={t.id} title={t.label} value={formatMathMoney(t.value, '+')} />)}
        <ListRow title="Estimated additional coverage, if added" value={formatMathMoney(r.additional, '+')} />
        <ListRow title={<strong>Funds available if the gap is filled</strong>} value={<strong>{formatMoney(funds.fundsAvailable)}</strong>} />
        {funds.costs.map((t) => <ListRow key={t.id} title={t.label}
          subtitle={t.id === 'education' || t.id === 'newChild' ? 'Set aside for future costs' : undefined}
          value={formatMathMoney(t.value, '−')} />)}
        <ListRow title="Costs paid or set aside" value={formatMoney(funds.costsSetAside)} />
        <ListRow title={<strong>Remaining for ongoing support</strong>} value={<strong className="tint-text">{formatMoney(funds.remainingSupport)}</strong>} />
        <ListRow title="Planned ongoing support" subtitle={support.detail} value={formatMoney(support.value)} />
      </ListSection>
      {r.leftOut.length > 0 && <p className="footnote muted">Not included in either view: {r.leftOut.join(', ').toLowerCase()}.</p>}
    </div>
  )
}
