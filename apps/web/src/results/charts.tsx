// The charts Abe presents on the results story. Each one draws numbers it is given
// (all from calculate()); none of them do any math beyond scaling to the space.
// Bars are HTML so widths animate smoothly when the what-if controls change them.
import type { CSSProperties } from 'react'
import { formatMoney, formatPercent } from '../domain/calculator.ts'

export type Slice = { id: string; label: string; value: number }

const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, (part / whole) * 100) : 0)
const delay = (i: number, step = 70): CSSProperties => ({ ['--delay' as string]: `${i * step}ms` })

/* The short version: the estimate as one number, plus how much is already in place. */
export function SummaryChart({ additional, totalNeeds, totalResources }: { additional: number; totalNeeds: number; totalResources: number }) {
  const covered = formatPercent(totalResources, totalNeeds)
  return (
    <div className="viz-summary">
      <p className="viz-summary__label">{additional > 0 ? 'Additional coverage to consider' : 'Additional coverage needed'}</p>
      <p className="viz-summary__value">{formatMoney(additional)}</p>
      <div className="viz-meter" role="img" aria-label={`${covered} of what your family would need is already in place`}>
        <div className="viz-meter__head">
          <span>Already in place</span>
          <strong>{covered}</strong>
        </div>
        <div className="viz-meter__track"><span className="viz-meter__fill viz-grow-x" style={{ width: totalResources > 0 ? `max(4px, ${pct(totalResources, totalNeeds)}%)` : '0%' }} /></div>
        <p className="viz-meter__foot">{formatMoney(totalResources)} of {formatMoney(totalNeeds)}</p>
      </div>
    </div>
  )
}

/* Everyday costs stacking up: one column per year, each the running total so far. */
export function YearsChart({ support, years, startAge }: { support: number; years: number; startAge?: number }) {
  const total = support * years
  const cols = Array.from({ length: years }, (_, i) => (i + 1) * support)
  const step = Math.max(12, Math.round(900 / years))
  return (
    <div className="viz-years" role="img" aria-label={`${formatMoney(support)} a year for ${years} years adds up to ${formatMoney(total)}`}>
      <div className="viz-years__plot" style={{ ['--n' as string]: years }}>
        {cols.map((v, i) => (
          <span key={i} className="viz-years__col" title={`Year ${i + 1}: ${formatMoney(v)} so far`}>
            <span className="viz-years__bar viz-grow-y" style={{ height: `${pct(v, total)}%`, ...delay(i, step) }} />
          </span>
        ))}
        <span className="viz-years__cap" style={delay(years, step)}>{formatMoney(total)}</span>
      </div>
      <div className="viz-axis">
        <span>{startAge != null ? `Now (age ${startAge})` : 'Year 1'}</span>
        <span>{startAge != null ? `Year ${years} (age ${startAge + years})` : `Year ${years}`}</span>
      </div>
    </div>
  )
}

/* What the family would need, one bar per item, on a shared scale. */
export function NeedsChart({ items, total }: { items: Slice[]; total: number }) {
  const max = Math.max(...items.map((t) => t.value), 1)
  return (
    <div className="viz-bars" role="img" aria-label={`${items.map((t) => `${t.label} ${formatMoney(t.value)}`).join(', ')}. Total ${formatMoney(total)}.`}>
      {items.map((t, i) => (
        <div key={t.id} className="viz-bars__row" title={`${t.label}: ${formatMoney(t.value)}`}>
          <span className="viz-bars__label">{t.label}</span>
          <span className="viz-bars__track">
            <span className="viz-bars__bar viz-bars__bar--need viz-grow-x" style={{ width: `${pct(t.value, max)}%`, ...delay(i, 110) }} />
            <span className="viz-bars__value">{formatMoney(t.value)}</span>
          </span>
        </div>
      ))}
      <div className="viz-bars__total"><span>Total</span><strong>{formatMoney(total)}</strong></div>
    </div>
  )
}

/* Needed vs. already in place. With showGap, the gap fills in the rest of the bar. */
export function CoverageChart({ totalNeeds, resources, additional, showGap }: {
  totalNeeds: number; resources: Slice[]; additional: number; showGap: boolean
}) {
  const have = resources.reduce((s, t) => s + t.value, 0)
  const max = Math.max(totalNeeds, have, 1)
  const gapShown = showGap && additional > 0
  const held = resources.filter((t) => t.value > 0)
  // Segments after the first give up 2px for the surface gap, so a full row matches the "need" row.
  const segWidth = (v: number, i: number) => (i === 0 ? `${pct(v, max)}%` : `calc(${pct(v, max)}% - 2px)`)
  return (
    <div className="viz-coverage" role="img" aria-label={
      `Your family would need ${formatMoney(totalNeeds)}. You have ${formatMoney(have)} in place` +
      (gapShown ? `, leaving a gap of ${formatMoney(additional)}.` : '.')
    }>
      <div className="viz-coverage__row">
        <div className="viz-coverage__head"><span>What your family would need</span><strong>{formatMoney(totalNeeds)}</strong></div>
        <div className="viz-coverage__track">
          <span className="viz-seg viz-seg--need viz-grow-x" style={{ width: `${pct(totalNeeds, max)}%` }} title={`Would need: ${formatMoney(totalNeeds)}`} />
        </div>
      </div>
      <div className="viz-coverage__row">
        <div className="viz-coverage__head"><span>{gapShown ? 'What you have, plus the gap' : 'What you already have'}</span><strong>{formatMoney(gapShown ? have + additional : have)}</strong></div>
        <div className="viz-coverage__track">
          {held.map((t, i) => (
            <span
              key={t.id} className={'viz-seg viz-seg--have viz-grow-x' + (!gapShown && i === held.length - 1 ? ' is-end' : '')}
              style={{ width: segWidth(t.value, i), ...delay(i + 1, 160) }} title={`${t.label}: ${formatMoney(t.value)}`}
            />
          ))}
          <span
            className={'viz-seg viz-seg--gap is-end' + (gapShown ? ' is-shown' : '')}
            style={{ width: gapShown ? segWidth(additional, held.length) : '0%' }}
            title={`Gap to consider: ${formatMoney(additional)}`}
          />
        </div>
      </div>
      <ul className="viz-legend">
        <li><span className="viz-key viz-key--need" />Would need <strong>{formatMoney(totalNeeds)}</strong></li>
        {resources.map((t) => (
          <li key={t.id}><span className="viz-key viz-key--have" />{t.label} <strong>{formatMoney(t.value)}</strong></li>
        ))}
        {resources.length === 0 && <li><span className="viz-key viz-key--have" />Already in place <strong>{formatMoney(0)}</strong></li>}
        <li className={'viz-legend__gap' + (gapShown ? ' is-shown' : '')}><span className="viz-key viz-key--gap" />Gap to consider <strong>{formatMoney(additional)}</strong></li>
      </ul>
    </div>
  )
}

/* What if: today's estimate above the scenario's. The hatched piece is what the changes add. */
export function ScenarioChart({ base, next, changes }: { base: number; next: number; changes: Slice[] }) {
  const max = Math.max(base, next, 1)
  const extra = Math.max(0, next - base)
  const kept = Math.min(base, next)
  return (
    <div className="viz-coverage viz-scenario" role="img" aria-label={
      `Your estimate today is ${formatMoney(base)}. With these changes it would be ${formatMoney(next)}.` +
      changes.map((c) => ` ${c.label} adds ${formatMoney(c.value)}.`).join('')
    }>
      <div className="viz-coverage__row">
        <div className="viz-coverage__head"><span>Your estimate today</span><strong>{formatMoney(base)}</strong></div>
        <div className="viz-coverage__track">
          <span className="viz-seg viz-seg--today is-end viz-grow-x" style={{ width: `${pct(base, max)}%` }} />
        </div>
      </div>
      <div className="viz-coverage__row">
        <div className="viz-coverage__head"><span>With these changes</span><strong>{formatMoney(next)}</strong></div>
        <div className="viz-coverage__track">
          <span className={'viz-seg viz-seg--today viz-grow-x' + (extra ? '' : ' is-end')} style={{ width: `${pct(kept, max)}%` }} />
          <span className="viz-seg viz-seg--added is-end viz-grow-x" style={{ width: extra ? `calc(${pct(extra, max)}% - 2px)` : '0%' }} />
        </div>
      </div>
      {changes.length
        ? (
          <ul className="viz-scenario__list">
            {changes.map((c) => <li key={c.id}><span className="viz-key viz-key--added" />{c.label}<strong>+ {formatMoney(c.value)}</strong></li>)}
          </ul>
        )
        : <p className="viz-scenario__empty">Turn on a change to compare.</p>}
    </div>
  )
}

/* Everyday costs still ahead: one less year to cover each year that passes. */
export function TimeChart({ support, years, startAge }: { support: number; years: number; startAge?: number }) {
  const total = support * years
  const W = 320, H = 180, padT = 8, padB = 4
  const x = (i: number) => (i / years) * W
  const y = (v: number) => padT + (1 - v / Math.max(total, 1)) * (H - padT - padB)
  const pts = Array.from({ length: years + 1 }, (_, i) => [x(i), y(total - i * support)] as const)
  const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)} ${b.toFixed(1)}`).join(' ')
  const area = `${line} L${W} ${H - padB} L0 ${H - padB} Z`
  const mid = Math.floor(years / 2)
  return (
    <div className="viz-time" role="img" aria-label={`Everyday costs still ahead go from ${formatMoney(total)} now down to $0 after ${years} years`}>
      <div className="viz-time__labels">
        <span><strong>{formatMoney(total)}</strong> now</span>
        {years >= 4 && <span>{formatMoney(total - mid * support)} in year {mid}</span>}
      </div>
      <div className="viz-time__plot">
      <svg className="viz-time__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} className="viz-grid" x1="0" x2={W} y1={y(total * f)} y2={y(total * f)} />)}
        <line className="viz-baseline" x1="0" x2={W} y1={H - padB} y2={H - padB} />
        <g className="viz-time__reveal">
          <path className="viz-time__area" d={area} />
          <path className="viz-time__line" d={line} />
        </g>
      </svg>
      <div className="viz-time__dots" aria-hidden="true">
        {pts.map(([a, b], i) => (years <= 20 || i === 0 || i === years) && (
          <span
            key={i} className="viz-time__dot" style={{ left: `${(a / W) * 100}%`, top: `${(b / H) * 100}%`, ...delay(i, Math.max(12, Math.round(900 / years))) }}
            title={i === 0 ? `Now: ${formatMoney(total)}` : `After year ${i}: ${formatMoney(total - i * support)}`}
          />
        ))}
      </div>
      </div>
      <div className="viz-axis">
        <span>{startAge != null ? `Now (age ${startAge})` : 'Now'}</span>
        <span>{startAge != null ? `Year ${years} (age ${startAge + years})` : `Year ${years}`}</span>
      </div>
    </div>
  )
}
