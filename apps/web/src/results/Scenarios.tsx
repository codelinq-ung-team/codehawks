// The "what if" step: try a life change and see how the number moves. Scenarios only change
// the math for this step (compareScenario); the saved answers, the summary and the plans stay put.
import { Button } from '../kit/Kit.tsx'
import { NEW_CHILD, formatMoney, type Scenario, type ScenarioResult } from '../domain/calculator.ts'
import { yearsText } from './ask.ts'

const RATES = [
  { value: 0, label: 'Off' },
  { value: 0.02, label: '2%' },
  { value: 0.03, label: '3%' },
]

export function ScenarioControls({ scenario, onChange, result }: {
  scenario: Scenario; onChange: (s: Scenario) => void; result: ScenarioResult | null
}) {
  const child = scenario.newChild
  const rate = scenario.inflation ?? 0
  const setChild = (next: Partial<typeof NEW_CHILD>) => child && onChange({ ...scenario, newChild: { ...child, ...next } })
  const longer = result && result.nextYears > result.years

  return (
    <>
      <p>Try a change and watch the chart. Your answers stay the same.</p>
      <div className="ck-list__body whatif" role="list">
        <label className="ck-row scenario-toggle" role="listitem">
          <span className="ck-row__text">
            <span className="ck-row__title">Another child someday</span>
            <span className="ck-row__subtitle">More years of support, plus an education fund</span>
          </span>
          <input
            type="checkbox" className="scenario-switch" checked={!!child}
            onChange={(e) => onChange({ ...scenario, newChild: e.target.checked ? NEW_CHILD : undefined })}
          />
        </label>
        {child && (
          <>
            <Stepper
              label="Arriving in about" value={child.inYears ? yearsText(child.inYears) : 'This year'}
              dec={() => setChild({ inYears: child.inYears - 1 })} inc={() => setChild({ inYears: child.inYears + 1 })}
              canDec={child.inYears > 0} canInc={child.inYears < 10}
            />
            <Stepper
              label="Education fund" value={formatMoney(child.education)} hint="about 4 years of in-state tuition"
              dec={() => setChild({ education: child.education - 10_000 })} inc={() => setChild({ education: child.education + 10_000 })}
              canDec={child.education > 0} canInc={child.education < 300_000}
            />
          </>
        )}
        <div className="ck-row scenario-rate" role="listitem">
          <span className="ck-row__text">
            <span className="ck-row__title" id="scenario-rate">Prices rise each year</span>
            <span className="ck-row__subtitle">2% is the Fed’s goal; 3% is closer to the long-run average</span>
          </span>
          <span className="scenario-rate__options" role="group" aria-labelledby="scenario-rate">
            {RATES.map((r) => (
              <button
                key={r.label} type="button" className="scenario-rate__option" aria-pressed={rate === r.value}
                onClick={() => onChange({ ...scenario, inflation: r.value || undefined })}
              >{r.label}</button>
            ))}
          </span>
        </div>
      </div>
      {longer && <p>Support would need to last <strong>{yearsText(result.nextYears)}</strong> instead of {yearsText(result.years)}. If you choose term coverage, that points to a longer term.</p>}
      {rate > 0 && <p>A policy pays a set amount, and prices tend to rise. Some families round up a little or review their coverage every few years.</p>}
    </>
  )
}

export function Stepper({ label, value, hint, dec, inc, canDec, canInc }: {
  label: string; value: string; hint?: string; dec: () => void; inc: () => void; canDec: boolean; canInc: boolean
}) {
  return (
    <div className="ck-row stepper-row" role="listitem">
      <span className="ck-row__text">
        <span className="ck-row__title">{label}</span>
        <span className="ck-row__subtitle" aria-live="polite">{value}{hint && <span className="stepper-row__hint"> · {hint}</span>}</span>
      </span>
      <span className="stepper-row__buttons">
        <Button variant="bordered" size="small" disabled={!canDec} onClick={dec} aria-label={`Decrease ${label.toLowerCase()}`}>−</Button>
        <Button variant="bordered" size="small" disabled={!canInc} onClick={inc} aria-label={`Increase ${label.toLowerCase()}`}>+</Button>
      </span>
    </div>
  )
}
