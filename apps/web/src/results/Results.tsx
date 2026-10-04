// Results: a slide deck. Abe presents one chart per step on an easel, and reacts to it,
// so the estimate is explained a piece at a time instead of all at once.
// Every number here comes from calculate(); the page does no math of its own.
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { Banner, Button, EmptyState, Icon, ListRow, ListSection } from '../kit/Kit.tsx'
import { Page } from '../lib/Chrome.tsx'
import { go, useStore } from '../lib/store.ts'
import { GuidePose, type PoseName } from '../guide/Poses.tsx'
import { GUIDE_NAME } from '../guide/guide.ts'
import { FIELDS, calculate, compareScenario, formatMoney, formatPercent, summaryText, type Profile, type Scenario } from '../domain/calculator.ts'
import { CoverageChart, NeedsChart, ScenarioChart, SummaryChart, TimeChart, YearsChart, type Slice } from './charts.tsx'
import { AskAbe, type AskHandle } from './AskAbe.tsx'
import { Plans } from './Plans.tsx'
import { ScenarioControls } from './Scenarios.tsx'
import { listJoin, yearsText, type Ready } from './ask.ts'
import { useRecommendation } from './useRecommendation.ts'
import { recommendationSummary } from './recommendations.ts'
import './results.css'

type ChartId = 'summary' | 'years' | 'needs' | 'have' | 'gap' | 'time' | 'whatif'
// Where Abe is, relative to the easel: standing in front of it at its left edge, or peeking over the top.
type Spot = 'side' | 'top'
type Step = { id: string; pose: PoseName; spot: Spot; chart: ChartId; eyebrow: string; title: string; body: ReactNode }

const CHART_TITLES: Record<ChartId, string> = {
  summary: 'Your estimate',
  years: 'Everyday costs, year by year',
  needs: 'What your family would need',
  have: 'Needed vs. already in place',
  gap: 'Needed vs. already in place',
  time: 'Everyday costs still ahead',
  whatif: 'Today vs. with these changes',
}

export function Results() {
  const { profile: p } = useStore()
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
  return <Story p={p} r={result} />
}

function Story({ p, r }: { p: Profile; r: Ready }) {
  const years = Number(p.years.value)
  const support = Number(p.support.value)
  const income = p.income.status === 'confirmed' ? Number(p.income.value) : null
  const startAge = p.youngestAge.status === 'confirmed' && p.household.value !== 'none' ? Number(p.youngestAge.value) : undefined
  const supportTotal = r.needs.find((t) => t.id === 'support')!.value
  const extras = r.needs.filter((t) => t.id !== 'support' && t.included && t.value > 0)
  const needItems: Slice[] = r.needs.filter((t) => t.included && t.value > 0).map((t) => ({
    id: t.id, label: t.id === 'support' ? `Everyday costs (${yearsText(years)})` : t.label, value: t.value,
  }))
  const resources: Slice[] = r.resources.filter((t) => t.included).map((t) => ({
    id: t.id, label: t.id === 'existing' ? 'Life insurance' : 'Savings', value: t.value,
  }))
  const covered = formatPercent(r.totalResources, r.totalNeeds)
  const gap = r.additional > 0
  const [scenario, setScenario] = useState<Scenario>({})
  const whatIf = compareScenario(p, scenario)

  const steps: Step[] = [
    {
      id: 'hello', pose: 'wave', spot: 'side', chart: 'summary', eyebrow: 'The short version',
      title: gap ? `About ${formatMoney(r.additional)} more coverage would help protect your family` : 'You’re covered for everything you listed',
      body: <>This is a starting point for a conversation, not a verdict, and nothing here needs a decision today. Tap the arrow and I’ll show you where the number comes from, one piece at a time.</>,
    },
    {
      id: 'years', pose: 'shocked', spot: 'side', chart: 'years', eyebrow: 'Everyday costs',
      title: 'Keeping life steady at home',
      body: <>
        You said your family would need <strong>{formatMoney(support)} a year</strong> for <strong>{yearsText(years)}</strong>.
        Each column is one more year. Stacked up, that comes to <strong>{formatMoney(supportTotal)}</strong>.
        {income != null && income > 0 && <> That’s about {formatPercent(support, income)} of the {formatMoney(income)} you earn now.</>}
        {startAge != null && <> By the end, your youngest would be {startAge + years}.</>}
      </>,
    },
    {
      id: 'needs', pose: 'peek', spot: 'top', chart: 'needs', eyebrow: 'One-time costs',
      title: extras.length ? 'Costs that only come up once' : 'No one-time costs to add',
      body: extras.length
        ? <>On top of everyday costs, you listed {listJoin(extras.map((t) => `${t.label.toLowerCase()} (${formatMoney(t.value)})`))}. All together, your family would need <strong>{formatMoney(r.totalNeeds)}</strong>.</>
        : <>You didn’t list any debts or one-time costs, so the total your family would need stays at <strong>{formatMoney(r.totalNeeds)}</strong>.</>,
    },
    {
      id: 'have', pose: 'thumbs', spot: 'side', chart: 'have', eyebrow: 'What you already have',
      title: r.totalResources > 0 ? `Good news: ${formatMoney(r.totalResources)} is already in place` : 'Starting from zero is common',
      body: r.totalResources > 0
        ? <>Your {listJoin(resources.filter((t) => t.value > 0).map((t) => `${t.label.toLowerCase()} (${formatMoney(t.value)})`))} would go toward that total. That’s <strong>{covered}</strong> of it already taken care of.</>
        : <>Many families don’t have coverage or savings set aside yet. That’s exactly what an estimate like this is for.</>,
    },
    {
      id: 'gap', pose: gap ? 'point' : 'heart', spot: 'side', chart: 'gap', eyebrow: 'The gap',
      title: gap ? `What’s left: ${formatMoney(r.additional)}` : 'No gap for what you listed',
      body: gap
        ? <>The orange piece is the difference between what your family would need and what you already have. It’s the amount of additional coverage worth talking through with a licensed professional.</>
        : <>What you have meets the needs you listed. It’s still worth checking again when life changes, like a new home or a new baby.</>,
    },
    {
      id: 'time', pose: 'ponder', spot: 'side', chart: 'time', eyebrow: 'Over time',
      title: 'The need gets smaller every year',
      body: <>Everyday costs only matter for the years your family depends on your income. Each year that passes leaves one less year to cover, so after {yearsText(years)} that part reaches zero. Term insurance is built around this idea: it covers a set number of years.</>,
    },
    {
      id: 'whatif', pose: 'think', spot: 'side', chart: 'whatif', eyebrow: 'What if',
      title: 'What if life changes?',
      body: <ScenarioControls scenario={scenario} onChange={setScenario} result={whatIf} />,
    },
  ]

  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const step = steps[index]
  const last = index === steps.length - 1

  function goTo(i: number) {
    if (i < 0 || i >= steps.length) return
    setDir(i >= index ? 1 : -1)
    setIndex(i)
  }

  // Arrow keys move between scenes, unless you're typing somewhere.
  const count = steps.length
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')
      if (e.altKey || e.ctrlKey || e.metaKey || typing) return
      const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (!delta) return
      setDir(delta)
      setIndex((i) => Math.min(count - 1, Math.max(0, i + delta)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count])

  // Swipe left or right on touch screens.
  const touch = useRef<{ x: number; y: number } | null>(null)
  function onTouchEnd(e: TouchEvent) {
    const start = touch.current
    touch.current = null
    if (!start) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(index + (dx < 0 ? 1 : -1))
  }

  function next() {
    if (last) document.getElementById('wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else goTo(index + 1)
  }

  return (
    <Page className="results story">
      <header className="story__intro">
        <h1 className="large-title">Here’s what we found</h1>
      </header>

      <div className="deck-wrap">
        <section
          className={'deck deck--' + step.id} style={{ ['--dir' as string]: dir }}
          aria-roledescription="carousel" aria-label={`Your results, explained by ${GUIDE_NAME}`}
          onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
          onTouchEnd={onTouchEnd}
        >
          <div className="deck__ground" aria-hidden="true" />

          <div className="deck__scene">
            <div className="deck__talk" key={step.id} data-dir={dir} aria-live="polite" aria-roledescription="slide" aria-label={`${index + 1} of ${steps.length}`}>
              <p className="deck__eyebrow">{step.eyebrow} <span className="deck__count">· {index + 1} of {steps.length}</span></p>
              <h2 className="deck__title">{step.title}</h2>
              <div className="deck__body">{step.body}</div>
            </div>

            <div className={'deck__board deck__board--' + step.spot}>
              <div className={'board-abe board-abe--' + step.spot} key={step.id + '-abe'} aria-hidden="true">
                <GuidePose name={step.pose} size={192} />
              </div>
              <div className="board">
                <h3 className="board__title">{CHART_TITLES[step.chart]}</h3>
                <div className="board__charts">
                  <ChartSlot on={step.chart === 'summary'}><SummaryChart additional={r.additional} totalNeeds={r.totalNeeds} totalResources={r.totalResources} /></ChartSlot>
                  <ChartSlot on={step.chart === 'years'}><YearsChart support={support} years={years} startAge={startAge} /></ChartSlot>
                  <ChartSlot on={step.chart === 'needs'}><NeedsChart items={needItems} total={r.totalNeeds} /></ChartSlot>
                  <ChartSlot on={step.chart === 'have' || step.chart === 'gap'}>
                    <CoverageChart totalNeeds={r.totalNeeds} resources={resources} additional={r.additional} showGap={step.chart === 'gap'} />
                  </ChartSlot>
                  <ChartSlot on={step.chart === 'time'}><TimeChart support={support} years={years} startAge={startAge} /></ChartSlot>
                  {whatIf && (
                    <ChartSlot on={step.chart === 'whatif'}>
                      <ScenarioChart base={whatIf.base.additional} next={whatIf.next.additional} changes={whatIf.changes} />
                    </ChartSlot>
                  )}
                </div>
                <span className="board__leg board__leg--l" aria-hidden="true" />
                <span className="board__leg board__leg--r" aria-hidden="true" />
              </div>
            </div>
          </div>
        </section>

        <nav className="deck-nav" aria-label="Move between steps">
          <button type="button" className="deck-nav__arrow deck-nav__arrow--prev" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous step">
            <Icon name="chevron-left" size={22} weight={2.6} />
          </button>
          <ol className="deck-nav__dots">
            {steps.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button" className={'deck-nav__dot' + (i === index ? ' is-on' : i < index ? ' is-past' : '')}
                  onClick={() => goTo(i)} aria-label={`Step ${i + 1}: ${s.eyebrow}`} aria-current={i === index ? 'step' : undefined}
                />
              </li>
            ))}
          </ol>
          <button type="button" className="deck-nav__arrow deck-nav__arrow--next" onClick={next} aria-label={last ? 'See the full math' : 'Next step'}>
            <Icon name="chevron-right" size={22} weight={2.6} />
          </button>
        </nav>
      </div>

      <Wrap p={p} r={r} />
    </Page>
  )
}

function ChartSlot({ on, children }: { on: boolean; children: ReactNode }) {
  return <div className={'stage__chart' + (on ? ' is-on' : '')} aria-hidden={!on}>{children}</div>
}

// After the story: term vs. permanent, then the full math as a list, questions for Abe beside it,
// and the summary to copy.
function Wrap({ p, r }: { p: Profile; r: Ready }) {
  const recommendations = useRecommendation(p, r.additional)
  const summary = summaryText(p, r) + (recommendations.result ? '\n\n' + recommendationSummary(recommendations.result) : '')
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const askRef = useRef<AskHandle>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(summary)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }
  return (
    <section className="wrap" id="wrap" aria-label="Your summary">
      <Plans p={p} r={r} onAsk={(q) => askRef.current?.ask(q)} recommendation={recommendations.result}
        loading={recommendations.loading} failed={recommendations.failed} onRetry={recommendations.retry} />

      <div className="wrap__grid">
        <ListSection
          header="The full math" className="wrap__math"
          footer={r.leftOut.length ? `Not included: ${r.leftOut.join(', ').toLowerCase()}.` : undefined}
        >
          {r.needs.filter((t) => t.included).map((t) => <ListRow key={t.id} title={t.label} subtitle={t.detail} value={`+ ${formatMoney(t.value)}`} />)}
          <ListRow title={<strong>What your family would need</strong>} value={<strong>{formatMoney(r.totalNeeds)}</strong>} />
          {r.resources.filter((t) => t.included).map((t) => <ListRow key={t.id} title={t.label} value={`− ${formatMoney(t.value)}`} />)}
          <ListRow title={<strong>Estimated additional coverage</strong>} value={<strong className="tint-text">{formatMoney(r.additional)}</strong>} />
        </ListSection>

        <AskAbe p={p} r={r} ref={askRef} recommendation={recommendations.result} />

        <div className="wrap__actions stack">
          <Button size="large" fullWidth icon="share" onClick={() => void copy()}>Copy Summary</Button>
          {copied === 'ok' && <Banner tone="success" title="Summary copied" message="Paste it into a note or email to bring to a licensed professional." onDismiss={() => setCopied(null)} />}
          {copied === 'fail' && (
            <>
              <Banner tone="warning" title="We couldn’t copy that" message="Your browser blocked the clipboard. Select the text in the summary and copy it yourself." />
              <textarea className="summary-text" readOnly value={summary} aria-label="Summary" onFocus={(e) => e.target.select()} />
            </>
          )}
          <Button variant="bordered" fullWidth onClick={() => go('review')}>Change My Answers</Button>
        </div>
      </div>

      <div className="wrap__hero">
        <GuidePose name="thumbs" size={96} className="wrap__abe" />
        <div className="wrap__hero-text">
          <h2 className="title-2">That’s the whole picture</h2>
          <p className="body muted">Bring this summary to a licensed professional. They can turn it into real options for your family.</p>
        </div>
      </div>

      <p className="footnote muted limits">These are educational coverage recommendations to discuss with a licensed professional, not quotes or underwriting approval. The estimate doesn’t account for inflation, investment returns, taxes, or Social Security benefits.</p>
    </section>
  )
}
