// Term vs. permanent, side by side like plan cards on a pricing page, with a "?" between them
// that asks Abe about the difference. Each card ends with how it lines up with this estimate;
// those amounts come from calculate(), and there are no prices because this isn't a quote.
import type { ReactNode } from 'react'
import { Button, Icon, type IconName } from '../kit/Kit.tsx'
import { GUIDE_NAME } from '../guide/guide.ts'
import { formatMoney, type Profile } from '../domain/calculator.ts'
import type { Ready } from './ask.ts'
import type { PolicyOption, Recommendation } from './recommendations.ts'
import { DEFAULT_POLICIES, defaultQualifications, type DefaultPolicy } from './defaultPolicies.ts'

const COMPARE = 'What’s the difference between term and permanent life insurance, and what matters for my situation?'
const ABOUT_TERM = 'Tell me more about term life insurance. How would it fit my situation?'
const ABOUT_PERMANENT = 'Tell me more about permanent life insurance. How would it fit my situation?'

export function Plans({ onAsk, recommendation, loading, failed, onRetry }: {
  p: Profile; r: Ready; onAsk: (question: string) => void; recommendation: Recommendation | null
  loading: boolean; failed: boolean; onRetry: () => void
}) {
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
          icon="calendar" name="Term" defaultPolicy={DEFAULT_POLICIES.term}
          big="10–30" unit="years of coverage" cost={1} costLabel="Usually costs less"
          ask={<Button variant="bordered" fullWidth onClick={() => onAsk(ABOUT_TERM)} className="lift">Ask about term</Button>}
        />

        <button type="button" className="plans__ask" onClick={() => onAsk(COMPARE)}>
          <span className="plans__ask-mark" aria-hidden="true">?</span>
          <span className="plans__ask-label">What’s the difference?<span className="sr-only"> Ask {GUIDE_NAME}</span></span>
        </button>

        <Plan
          option={recommendation?.permanent} unavailable={!!recommendation && !recommendation.permanent}
          recommended={recommendation?.recommendedType === 'permanent'} reason={recommendation?.reason}
          icon="shield" name="Permanent" defaultPolicy={DEFAULT_POLICIES.permanent}
          big="Lifetime" unit="coverage" cost={3} costLabel="Usually costs more"
          ask={<Button variant="bordered" fullWidth onClick={() => onAsk(ABOUT_PERMANENT)} className="lift">Ask about permanent</Button>}
        />
      </div>
    </section>
  )
}

function Plan({ icon, name, big, unit, cost, costLabel, ask, defaultPolicy, option, unavailable, recommended, reason }: {
  icon: IconName; name: string; big: string; unit: string; cost: 1 | 2 | 3; costLabel: string
  ask: ReactNode; defaultPolicy: DefaultPolicy
  option?: PolicyOption | null; unavailable: boolean; recommended: boolean; reason?: string
}) {
  const policy = option ?? defaultPolicy
  const isRecommended = recommended && !!option
  const qualifications = option?.qualifications ?? defaultQualifications(defaultPolicy)
  return (
    <div className={'plan-slot' + (isRecommended ? ' plan-slot--recommended' : '')}>
    <div className="plan-slot__banner">{isRecommended && <span>Recommended<span className="sr-only">: {name} coverage</span></span>}</div>
    <article className="plan" aria-label={`${name} life insurance${isRecommended ? ', recommended' : !option ? ', example policy' : ''}`}>
      <span className="plan__icon" aria-hidden="true"><Icon name={icon} size={24} /></span>
      <div className="plan__head">
        <h4 className="plan__name">{name}</h4>
        <p className="plan__tagline">{policy.name}</p>
        {!option && <p className="plan__example">Example policy</p>}
      </div>
      <p className={'plan__big' + (option ? ' plan__big--amount' : '')}><strong>{option ? formatMoney(option.amount) : big}</strong> <span>{option ? 'additional coverage' : unit}</span></p>
      {option && <p className="plan__duration">{option.termYears ? `${option.termYears} years of coverage` : 'Potential lifelong protection with adequate funding'}</p>}
      {!option && <p className="plan__duration">{defaultPolicy.terms.length ? `Published terms: ${defaultPolicy.terms.join(', ')} years; eligibility varies.` : 'Potential lifelong protection with adequate funding'}</p>}
      <p className="plan__cost">
        <span className="plan__meter" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i <= cost ? 'is-on' : undefined} />)}</span>
        {costLabel}
      </p>
      {ask}
      <ul className="plan__points">
        {policy.points.map((t) => <li key={t}><Icon name="check" size={18} weight={2.4} className="plan__check" />{t}</li>)}
        <li className="plan__catch"><span className="plan__dash" aria-hidden="true" /><span className="sr-only">Keep in mind: </span>{policy.caveat}</li>
      </ul>
      <div className="plan__fit">
        <p className="plan__fit-title">{option ? isRecommended ? 'Why it fits' : 'In your estimate' : 'About this policy'}</p>
        <p>{option?.fit ?? 'No personalized policy selected; availability depends on eligibility.'}</p>
        {isRecommended && reason && <p className="plan__reason">{reason}</p>}
        {unavailable && <p>No additional coverage needed or no supported policy match in this shortlist.</p>}
      </div>
      <ul className="plan__qualifications">{qualifications.map((note) => <li key={note}>{note}</li>)}</ul>
      <a className="plan__source" href={policy.source} target="_blank" rel="noreferrer">Reviewed policy source<span className="sr-only"> for {policy.name} (opens a new tab)</span></a>
    </article>
    </div>
  )
}
