import { ListSection } from '../kit/Kit.tsx'
import { setState, useStore } from '../lib/store.ts'
import type { CoveragePreferences as Preferences } from '../results/recommendations.ts'

const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')

export function CoveragePreferences() {
  const { coveragePreferences: p, form } = useStore()
  const save = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setState((s) => ({ coveragePreferences: { ...s.coveragePreferences, [key]: value } }))
  return (
    <ListSection header="Coverage preferences" footer="Optional. These answers help Abe compare policies; they don’t change your coverage calculation. Premiums still require an individual quote.">
      <div className="coverage-preferences">
        <label>Age
          <input type="number" min={0} max={120} step={1} value={form.age ?? ''} placeholder="Not provided"
            onChange={(e) => {
              const age = e.target.value === '' ? null : Number(e.target.value)
              if (age === null || Number.isInteger(age) && age >= 0 && age <= 120) setState((s) => ({ form: { ...s.form, age } }))
            }} />
        </label>
        <label>Which state do you live in?
          <select value={p.state ?? ''} onChange={(e) => save('state', e.target.value || null)}>
            <option value="">Not provided</option>{STATES.map((state) => <option key={state}>{state}</option>)}
          </select>
        </label>
        <label>Do you use tobacco?
          <select value={p.tobacco ?? ''} onChange={(e) => save('tobacco', e.target.value as Preferences['tobacco'] || null)}>
            <option value="">Not sure / prefer to skip</option><option value="no">No</option><option value="yes">Yes</option>
          </select>
        </label>
        <label>What do you want coverage to protect?
          <select value={p.goal ?? ''} onChange={(e) => save('goal', e.target.value as Preferences['goal'] || null)}>
            <option value="">Not sure yet</option><option value="temporary">Needs that end, like family support or a mortgage</option>
            <option value="lifelong">Lifelong needs, like final expenses or a legacy</option><option value="both">Both temporary and lifelong needs</option>
          </select>
        </label>
        <label>What matters most for premiums?
          <select value={p.premium ?? ''} onChange={(e) => save('premium', e.target.value as Preferences['premium'] || null)}>
            <option value="">Not sure yet</option><option value="low">Keep costs low</option><option value="higher">Open to higher premiums for lifelong protection</option>
          </select>
        </label>
        <label>Are you interested in cash value?
          <select value={p.cashValue ?? ''} onChange={(e) => save('cashValue', e.target.value as Preferences['cashValue'] || null)}>
            <option value="">Not sure yet</option><option value="no">No, protection is my priority</option><option value="yes">Yes, explain those options too</option>
          </select>
        </label>
      </div>
    </ListSection>
  )
}
