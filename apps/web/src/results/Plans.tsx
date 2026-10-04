// Term vs. permanent, side by side like plan cards on a pricing page, with a "?" between them
// that asks Abe about the difference. Each card ends with how it lines up with this estimate;
// those amounts come from calculate(), and there are no prices because this isn't a quote.
import type { ReactNode } from 'react'
import { Button, Icon, type IconName } from '../kit/Kit.tsx'
import { GUIDE_NAME } from '../guide/guide.ts'
import { formatMoney, type Profile } from '../domain/calculator.ts'
import { yearsText, type Ready } from './ask.ts'
import type { PolicyOption, Recommendation } from './recommendations.ts'

const COMPARE = 'What’s the difference between term and permanent life insurance, and what matters for my situation?'
const ABOUT_TERM = 'Tell me more about term life insurance. How would it fit my situation?'
const ABOUT_PERMANENT = 'Tell me more about permanent life insurance. How would it fit my situation?'

export function Plans({ p, r, onAsk, recommendation, loading, failed, onRetry }: {
  p: Profile; r: Ready; onAsk: (question: string) => void; recommendation: Recommendation | null
  loading: boolean; failed: boolean; onRetry: () => void
}) {
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
        <p className="callout muted">Two alternatives for your estimated coverage gap. The amounts aren’t added together.</p>
        <div className="plans__status" role="status" aria-live="polite">
          {loading && <p>Abe is comparing researched policies with your answers…</p>}
          {failed && <><p>Abe couldn’t compare policies right now. These cards explain the coverage types.</p><Button variant="bordered" size="small" onClick={onRetry}>Try Again</Button></>}
          {recommendation && !recommendation.recommendedType && <p>{recommendation.reason}</p>}
        </div>
      </div>

      <div className="plans__row">
        <Plan
          option={recommendation?.term} unavailable={!!recommendation && !recommendation.term}
          recommended={recommendation?.recommendedType === 'term'} reason={recommendation?.reason}
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
          option={recommendation?.permanent} unavailable={!!recommendation && !recommendation.permanent}
          recommended={recommendation?.recommendedType === 'permanent'} reason={recommendation?.reason}
          icon="shield" name="Permanent" tagline="Potential lifelong protection with adequate funding."
          big="Lifetime" unit="coverage" cost={3} costLabel="Usually costs more"
          ask={<Button variant="bordered" fullWidth onClick={() => onAsk(ABOUT_PERMANENT)}>Ask about permanent</Button>}
          points={['Designed for lifelong protection, subject to funding and policy conditions', 'Most kinds build cash value; loans can reduce benefits', 'Fits needs with no end date, like final expenses or leaving something behind']}
          catchText="Costs much more for the same amount of coverage."
          fit={final > 0
            ? <>Your {formatMoney(final)} for funeral and final expenses could come at any age, so it has no end date.</>
            : <>Nothing you listed lasts a lifetime. Final expenses, or money to leave behind, would.</>}
        />
      </div>
    </section>
  )
}

function Plan({ icon, name, tagline, big, unit, cost, costLabel, ask, points, catchText, fit, option, unavailable, recommended, reason }: {
  icon: IconName; name: string; tagline: string; big: string; unit: string; cost: 1 | 2 | 3; costLabel: string
  ask: ReactNode; points: string[]; catchText: string; fit: ReactNode
  option?: PolicyOption | null; unavailable: boolean; recommended: boolean; reason?: string
}) {
  return (
    <div className={'plan-slot' + (recommended ? ' plan-slot--recommended' : '')}>
    <div className="plan-slot__banner">{recommended && <span>Recommended<span className="sr-only">: {name} coverage</span></span>}</div>
    <article className="plan" aria-label={`${name} life insurance${recommended ? ', recommended' : ''}`}>
      <span className="plan__icon" aria-hidden="true"><Icon name={icon} size={24} /></span>
      <div className="plan__head">
        <h4 className="plan__name">{name}</h4>
        <p className="plan__tagline">{option?.name ?? tagline}</p>
      </div>
      <p className={'plan__big' + (option ? ' plan__big--amount' : '')}><strong>{option ? formatMoney(option.amount) : big}</strong> <span>{option ? 'additional coverage' : unit}</span></p>
      {option && <p className="plan__duration">{option.termYears ? `${option.termYears} years of coverage` : 'Potential lifelong protection with adequate funding'}</p>}
      <p className="plan__cost">
        <span className="plan__meter" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i <= cost ? 'is-on' : undefined} />)}</span>
        {costLabel}
      </p>
      {ask}
      <ul className="plan__points">
        {(option?.points ?? points).map((t) => <li key={t}><Icon name="check" size={18} weight={2.4} className="plan__check" />{t}</li>)}
        <li className="plan__catch"><span className="plan__dash" aria-hidden="true" /><span className="sr-only">Keep in mind: </span>{option?.caveat ?? catchText}</li>
      </ul>
      <div className="plan__fit">
        <p className="plan__fit-title">{option ? 'Why it fits' : 'In your estimate'}</p>
        <p>{option?.fit ?? fit}</p>
        {recommended && reason && <p className="plan__reason">{reason}</p>}
        {unavailable && <p>No additional coverage needed or no supported policy match in this shortlist.</p>}
      </div>
      {option && <>
        <ul className="plan__qualifications">{option.qualifications.map((note) => <li key={note}>{note}</li>)}</ul>
        <a className="plan__source" href={option.source} target="_blank" rel="noreferrer">Reviewed policy source<span className="sr-only"> for {option.name} (opens a new tab)</span></a>
      </>}
    </article>
    </div>
  )
}
