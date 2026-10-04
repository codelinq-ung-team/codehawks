import type { ReactNode } from 'react'
import { ListSection } from '../kit/Kit.tsx'
import { setState, useStore } from '../lib/store.ts'
import type { CoveragePreferences as Preferences } from '../results/recommendations.ts'
import { ADULT_AGE_ERROR, validAdultAge } from './adultAge.ts'

const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')

const save = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
  setState((s) => ({ coveragePreferences: { ...s.coveragePreferences, [key]: value } }))

// One optional question: blank means "not sure", which is never read as a yes or a no.
function Choice<K extends keyof Preferences>({ id, label, hint, blank, options }: {
  id: K; label: string; hint?: ReactNode; blank: string; options: [string, string][]
}) {
  const { coveragePreferences: p } = useStore()
  return (
    <label>{label}
      {hint && <small>{hint}</small>}
      <select value={p[id] ?? ''} onChange={(e) => save(id, (e.target.value || null) as Preferences[K])}>
        <option value="">{blank}</option>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  )
}

export function CoveragePreferences() {
  const { form } = useStore()
  return (
    <ListSection header="Coverage preferences" footer="Age is required; other answers are optional. These help Abe compare policies and note what underwriting may weigh. They don’t change how much coverage you need, and only underwriting can set a real premium.">
      <div className="coverage-preferences">
        <label>Age (required)
          <input id="coverage-age" type="number" min={18} max={120} step={1} required value={form.age ?? ''} placeholder="Your age"
            aria-invalid={!validAdultAge(form.age)} aria-describedby={!validAdultAge(form.age) ? 'coverage-age-error' : undefined}
            onChange={(e) => {
              const age = e.target.value === '' ? null : Number(e.target.value)
              setState((s) => ({ form: { ...s.form, age } }))
            }} />
        </label>
        {!validAdultAge(form.age) && <p id="coverage-age-error" role="alert">{ADULT_AGE_ERROR}</p>}
        <Choice id="state" label="Which state do you live in?" blank="Not provided" options={STATES.map((s) => [s, s])} />
        <Choice id="tobacco" label="Have you used tobacco or nicotine in the past 12 months?" blank="Not sure / prefer to skip" options={[['no', 'No'], ['yes', 'Yes']]}
          hint="Cigarettes, vapes, cigars, chewing tobacco, and nicotine pouches or gum all count." />
        <Choice id="health" label="How would you describe your health?" blank="Not sure / prefer to skip" options={[
          ['excellent', 'Excellent: no ongoing conditions'], ['good', 'Good: a managed condition'], ['fair', 'Fair: a serious condition'],
        ]} hint="Managed means something like high blood pressure or cholesterol. Serious means something like heart disease, diabetes or past cancer." />
      </div>
    </ListSection>
  )
}
