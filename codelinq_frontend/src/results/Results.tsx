// Results: a slide deck. Abe stands in a little scene and presents one chart per step,
// so the estimate is explained a piece at a time instead of all at once.
// Every number here comes from calculate(); the page does no math of its own.
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { Banner, Button, EmptyState, Icon, ListRow, ListSection } from '../kit/Kit.tsx'
import { Page } from '../lib/Chrome.tsx'
import { go, setField, useStore } from '../lib/store.ts'
import { GuidePose, type PoseName } from '../guide/Poses.tsx'
import { GUIDE_NAME } from '../guide/guide.ts'
import { Prop, type PropName } from '../guide/Props.tsx'
import { FIELDS, calculate, formatMoney, summaryText, type Estimate, type FieldId, type Profile } from '../domain/calculator.ts'
import { CoverageChart, NeedsChart, SummaryChart, TimeChart, YearsChart, type Slice } from './charts.tsx'
import './results.css'

type Ready = Extract<Estimate, { ready: true }>
type ChartId = 'summary' | 'years' | 'needs' | 'have' | 'gap' | 'time'
// x: % across the scene. y: px above the ground (floating props). sky: pinned near the top.
type ScenePropSpec = { name: PropName; x: number; y?: number; sky?: boolean; small?: boolean; float?: boolean }
type Step = { id: string; pose: PoseName; chart: ChartId; eyebrow: string; title: string; props: ScenePropSpec[]; body: ReactNode }

const CHART_TITLES: Record<ChartId, string> = {
  summary: 'Your estimate',
  years: 'Everyday costs, year by year',
  needs: 'What your family would need',
  have: 'Needed vs. already in place',
  gap: 'Needed vs. already in place',
  time: 'Everyday costs still ahead',
}

const listJoin = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
const yearsText = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`

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
  const covered = r.totalNeeds > 0 ? Math.round(Math.min(1, r.totalResources / r.totalNeeds) * 100) : 0
  const gap = r.additional > 0

  const steps: Step[] = [
    {
      id: 'hello', pose: 'wave', chart: 'summary', eyebrow: 'The short version',
      props: [{ name: 'family', x: 30 }, { name: 'heart', x: 33, y: 64, float: true }, { name: 'sun', sky: true, x: 6 }],
      title: gap ? `About ${formatMoney(r.additional)} more coverage would help protect your family` : 'You’re covered for everything you listed',
      body: <>This is a starting point for a conversation, not a verdict, and nothing here needs a decision today. Tap the arrow and I’ll show you where the number comes from, one piece at a time.</>,
    },
    {
      id: 'years', pose: 'calendar', chart: 'years', eyebrow: 'Everyday costs',
      props: [{ name: 'house', x: 27 }, { name: 'tree', x: 39 }, { name: 'cloud', sky: true, x: 8 }],
      title: 'Keeping life steady at home',
      body: <>
        You said your family would need <strong>{formatMoney(support)} a year</strong> for <strong>{yearsText(years)}</strong>.
        Each column is one more year. Stacked up, that comes to <strong>{formatMoney(supportTotal)}</strong>.
        {income != null && income > 0 && <> That’s about {Math.round((support / income) * 100)}% of the {formatMoney(income)} you earn now.</>}
        {startAge != null && <> By the end, your youngest would be {startAge + years}.</>}
      </>,
    },
    {
      id: 'needs', pose: 'clipboard', chart: 'needs', eyebrow: 'One-time costs',
      props: [{ name: 'receipt', x: 28 }, { name: 'receipt', x: 33, small: true }, { name: 'house', x: 40, small: true }],
      title: extras.length ? 'Costs that only come up once' : 'No one-time costs to add',
      body: extras.length
        ? <>On top of everyday costs, you listed {listJoin(extras.map((t) => `${t.label.toLowerCase()} (${formatMoney(t.value)})`))}. All together, your family would need <strong>{formatMoney(r.totalNeeds)}</strong>.</>
        : <>You didn’t list any debts or one-time costs, so the total your family would need stays at <strong>{formatMoney(r.totalNeeds)}</strong>.</>,
    },
    {
      id: 'have', pose: 'coin', chart: 'have', eyebrow: 'What you already have',
      props: r.totalResources > 0
        ? [{ name: 'piggy', x: 28 }, { name: 'coins', x: 38 }, { name: 'spark', x: 36, y: 60, float: true }]
        : [{ name: 'piggy', x: 30 }],
      title: r.totalResources > 0 ? `Good news: ${formatMoney(r.totalResources)} is already in place` : 'Starting from zero is common',
      body: r.totalResources > 0
        ? <>Your {listJoin(resources.filter((t) => t.value > 0).map((t) => `${t.label.toLowerCase()} (${formatMoney(t.value)})`))} would go toward that total. That’s <strong>{covered}%</strong> of it already taken care of.</>
        : <>Many families don’t have coverage or savings set aside yet. That’s exactly what an estimate like this is for.</>,
    },
    {
      id: 'gap', pose: gap ? 'umbrella' : 'heart', chart: 'gap', eyebrow: 'The gap',
      props: [{ name: 'family', x: 29 }, { name: 'cloud', sky: true, x: 10 }, { name: 'spark', x: 41, y: 50, float: true }],
      title: gap ? `What’s left: ${formatMoney(r.additional)}` : 'No gap for what you listed',
      body: gap
        ? <>The orange piece is the difference between what your family would need and what you already have. Think of it as the size of the umbrella: the amount of additional coverage worth talking through with a licensed professional.</>
        : <>What you have meets the needs you listed. It’s still worth checking again when life changes, like a new home or a new baby.</>,
    },
    {
      id: 'time', pose: 'hourglass', chart: 'time', eyebrow: 'Over time',
      props: [{ name: 'plant', x: 26, small: true }, { name: 'plant', x: 32 }, { name: 'tree', x: 40 }, { name: 'sun', sky: true, x: 8 }],
      title: 'The need gets smaller every year',
      body: <>Everyday costs only matter for the years your family depends on your income. Each year that passes leaves one less year to cover, so after {yearsText(years)} that part reaches zero. Term insurance is built around this idea: it covers a set number of years.</>,
    },
    {
      id: 'try', pose: 'cheer', chart: 'gap', eyebrow: 'Try it yourself',
      props: [{ name: 'spark', x: 27, y: 40, float: true }, { name: 'coins', x: 31 }, { name: 'plant', x: 39 }, { name: 'spark', x: 42, y: 70, float: true }],
      title: 'See how a change moves the number',
      body: <WhatIf p={p} />,
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
    if (last) document.getElementById('wrap-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else goTo(index + 1)
  }

  return (
    <Page className="results story">
      <header className="story__intro">
        <h1 className="large-title">Here’s what we found</h1>
      </header>

      <section
        className={'deck deck--' + step.id} style={{ ['--dir' as string]: dir }}
        aria-roledescription="carousel" aria-label={`Your results, explained by ${GUIDE_NAME}`}
        onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={onTouchEnd}
      >
        <div className="deck__sky" aria-hidden="true">
          <Prop name="cloud" className="deck__cloud deck__cloud--a" />
          <Prop name="cloud" className="deck__cloud deck__cloud--b" />
        </div>
        <div className="deck__ground" aria-hidden="true" />

        <div className="deck__scene">
          <div className="deck__talk" key={step.id} data-dir={dir} aria-live="polite" aria-roledescription="slide" aria-label={`${index + 1} of ${steps.length}`}>
            <p className="deck__eyebrow">{step.eyebrow} <span className="deck__count">· {index + 1} of {steps.length}</span></p>
            <h2 className="deck__title">{step.title}</h2>
            <div className="deck__body">{step.body}</div>
          </div>

          <div className="deck__board">
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
              </div>
            </div>
            <span className="board__leg board__leg--l" aria-hidden="true" />
            <span className="board__leg board__leg--r" aria-hidden="true" />
          </div>
        </div>

        <div className="deck__cast" key={step.id + '-cast'} aria-hidden="true">
          <GuidePose name={step.pose} size={144} className="deck__abe" />
          {step.props.map((pr, i) => (
            <Prop
              key={i} name={pr.name}
              className={'deck__prop' + (pr.sky ? ' is-sky' : '') + (pr.small ? ' is-small' : '') + (pr.float ? ' is-float' : '')}
              style={{ ['--x' as string]: `${pr.x}%`, ['--y' as string]: pr.y != null ? `${pr.y}px` : undefined, ['--i' as string]: i }}
            />
          ))}
        </div>

        <nav className="deck-nav" aria-label="Move between steps">
          <button type="button" className="deck-nav__arrow" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous step">
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
            <span className="deck-nav__label">{last ? 'See the full math' : index === 0 ? 'Show me' : 'Next'}</span>
            <Icon name="chevron-right" size={22} weight={2.6} />
          </button>
        </nav>
      </section>


      <Wrap p={p} r={r} />
    </Page>
  )
}

function ChartSlot({ on, children }: { on: boolean; children: ReactNode }) {
  return <div className={'stage__chart' + (on ? ' is-on' : '')} aria-hidden={!on}>{children}</div>
}

function WhatIf({ p }: { p: Profile }) {
  const years = Number(p.years.value)
  const support = Number(p.support.value)
  function adjust(id: FieldId, delta: number, min: number, max: number) {
    setField(id, { status: 'confirmed', value: Math.min(max, Math.max(min, Number(p[id].value) + delta)) })
  }
  return (
    <>
      <p>Change a number and watch the chart move. Your summary updates too.</p>
      <div className="ck-list__body whatif" role="list">
        <Stepper
          label="Years of support" value={yearsText(years)}
          dec={() => adjust('years', -1, 1, 70)} inc={() => adjust('years', 1, 1, 70)} canDec={years > 1} canInc={years < 70}
        />
        <Stepper
          label="Yearly support" value={formatMoney(support)}
          dec={() => adjust('support', -5000, 0, 10_000_000)} inc={() => adjust('support', 5000, 0, 10_000_000)} canDec={support > 0} canInc
        />
      </div>
    </>
  )
}

// After the story: the full math as a list, the summary to copy, and what to do next.
function Wrap({ p, r }: { p: Profile; r: Ready }) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(summaryText(p, r))
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }
  return (
    <section className="wrap" aria-labelledby="wrap-title">
      <div className="wrap__hero">
        <GuidePose name="thumbs" size={96} className="wrap__abe" />
        <div className="wrap__hero-text">
          <h2 className="title-2" id="wrap-title">That’s the whole picture</h2>
          <p className="body muted">Bring this summary to a licensed professional. They can turn it into real options for your family.</p>
        </div>
      </div>

      <div className="wrap__grid">
        <ListSection
          header="The full math"
          footer={r.leftOut.length ? `Not included: ${r.leftOut.join(', ').toLowerCase()}.` : undefined}
        >
          {r.needs.filter((t) => t.included).map((t) => <ListRow key={t.id} title={t.label} subtitle={t.detail} value={`+ ${formatMoney(t.value)}`} />)}
          <ListRow title={<strong>What your family would need</strong>} value={<strong>{formatMoney(r.totalNeeds)}</strong>} />
          {r.resources.filter((t) => t.included).map((t) => <ListRow key={t.id} title={t.label} value={`− ${formatMoney(t.value)}`} />)}
          <ListRow title={<strong>Estimated additional coverage</strong>} value={<strong className="tint-text">{formatMoney(r.additional)}</strong>} />
        </ListSection>

        <div className="wrap__side">
          <div className="stack">
            <Button size="large" fullWidth icon="share" onClick={() => void copy()}>Copy Summary</Button>
            {copied === 'ok' && <Banner tone="success" title="Summary copied" message="Paste it into a note or email to bring to a licensed professional." onDismiss={() => setCopied(null)} />}
            {copied === 'fail' && (
              <>
                <Banner tone="warning" title="We couldn’t copy that" message="Your browser blocked the clipboard. Select the text in the summary and copy it yourself." />
                <textarea className="summary-text" readOnly value={summaryText(p, r)} aria-label="Summary" onFocus={(e) => e.target.select()} />
              </>
            )}
            <Button variant="bordered" fullWidth onClick={() => go('review')}>Change My Answers</Button>
          </div>
          <ListSection header="Good to know">
            <ListRow icon="calendar" iconColor="orange" title="Term insurance" subtitle="Covers a set number of years. Often used for needs with an end date, like raising kids or paying off a mortgage." />
            <ListRow icon="shield" iconColor="teal" title="Permanent insurance" subtitle="Designed to last longer, and may include features beyond the death benefit, depending on the product." />
          </ListSection>
        </div>
      </div>

      <p className="footnote muted limits">This is an estimate to help you start a conversation, not a quote or a recommendation. It doesn’t account for inflation, investment returns, taxes, or Social Security benefits.</p>
    </section>
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
