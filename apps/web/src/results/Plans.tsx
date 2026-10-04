// Term vs. permanent, side by side like plan cards on a pricing page, with a "?" between them
// that asks Abe about the difference. Each card ends with how it lines up with this estimate;
// those amounts come from calculate(), and there are no prices because this isn't a quote.
import type { ReactNode } from 'react'
import { Button, Icon, type IconName } from '../kit/Kit.tsx'
import { GUIDE_NAME } from '../guide/guide.ts'
import { formatMoney, type Profile } from '../domain/calculator.ts'
import { yearsText, type Ready } from './ask.ts'

const COMPARE = 'What’s the difference between term and permanent life insurance, and what matters for my situation?'
const ABOUT_TERM = 'Tell me more about term life insurance. How would it fit my situation?'
const ABOUT_PERMANENT = 'Tell me more about permanent life insurance. How would it fit my situation?'

export function Plans({ p, r, onAsk }: { p: Profile; r: Ready; onAsk: (question: string) => void }) {
  const amount = (id: string) => {
    const t = r.needs.find((n) => n.id === id)
    return t?.included && t.value > 0 ? t.value : 0
  }
  const support = amount('support')
  const mortgage = amount('mortgage')
  const final = amount('finalExpenses')
  const years = Number(p.years.value)

  return (
    <section className="plans" aria-labelledby="plans-title">
      <div className="plans__head">
        <h3 className="ck-list__header" id="plans-title">Term or permanent?</h3>
        <p className="callout muted">The two main kinds of life insurance. Some families use a mix of both.</p>
      </div>

      <div className="plans__row">
        <Plan
          icon="calendar" name="Term" tagline="Coverage for the years your family depends on you."
          big="10–30" unit="years of coverage" cost={1} costLabel="Usually costs less"
          ask={<Button variant="bordered" fullWidth onClick={() => onAsk(ABOUT_TERM)}>Ask about term</Button>}
          points={['Covers a set number of years, often 10, 20 or 30', 'Usually the lowest price for the same amount of coverage', 'Fits needs that end, like income support or a mortgage']}
          catchText="No cash value, and coverage ends with the term. Some policies can be renewed or converted."
          fit={support > 0 && mortgage > 0
            ? <>Your everyday costs ({formatMoney(support)} over {yearsText(years)}) and your {formatMoney(mortgage)} mortgage both have an end date.</>
            : support > 0
              ? <>Your everyday costs ({formatMoney(support)} over {yearsText(years)}) have an end date.</>
              : mortgage > 0
                ? <>Your {formatMoney(mortgage)} mortgage has an end date: it shrinks as you pay it off.</>
                : <>Nothing you listed has a set end date. Income support or a mortgage would.</>}
        />

        <button type="button" className="plans__ask" onClick={() => onAsk(COMPARE)}>
          <span className="plans__ask-mark" aria-hidden="true">?</span>
          <span className="plans__ask-label">What’s the difference?<span className="sr-only"> Ask {GUIDE_NAME}</span></span>
        </button>

        <Plan
          icon="shield" name="Permanent" tagline="Coverage that lasts your whole life, such as whole life."
          big="Lifetime" unit="coverage" cost={3} costLabel="Usually costs more"
          ask={<Button variant="bordered" fullWidth onClick={() => onAsk(ABOUT_PERMANENT)}>Ask about permanent</Button>}
          points={['Lasts your whole life, as long as premiums are paid', 'Most kinds build cash value you can borrow against', 'Fits needs with no end date, like final expenses or leaving something behind']}
          catchText="Costs much more for the same amount of coverage."
          fit={final > 0
            ? <>Your {formatMoney(final)} for funeral and final expenses could come at any age, so it has no end date.</>
            : <>Nothing you listed lasts a lifetime. Final expenses, or money to leave behind, would.</>}
        />
      </div>
    </section>
  )
}

function Plan({ icon, name, tagline, big, unit, cost, costLabel, ask, points, catchText, fit }: {
  icon: IconName; name: string; tagline: string; big: string; unit: string; cost: 1 | 2 | 3; costLabel: string
  ask: ReactNode; points: string[]; catchText: string; fit: ReactNode
}) {
  return (
    <article className="plan" aria-label={`${name} life insurance`}>
      <span className="plan__icon" aria-hidden="true"><Icon name={icon} size={24} /></span>
      <div className="plan__head">
        <h4 className="plan__name">{name}</h4>
        <p className="plan__tagline">{tagline}</p>
      </div>
      <p className="plan__big"><strong>{big}</strong> <span>{unit}</span></p>
      <p className="plan__cost">
        <span className="plan__meter" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i <= cost ? 'is-on' : undefined} />)}</span>
        {costLabel}
      </p>
      {ask}
      <ul className="plan__points">
        {points.map((t) => <li key={t}><Icon name="check" size={18} weight={2.4} className="plan__check" />{t}</li>)}
        <li className="plan__catch"><span className="plan__dash" aria-hidden="true" /><span className="sr-only">Keep in mind: </span>{catchText}</li>
      </ul>
      <div className="plan__fit">
        <p className="plan__fit-title">In your estimate</p>
        <p>{fit}</p>
      </div>
    </article>
  )
}
