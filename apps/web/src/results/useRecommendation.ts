import { useEffect, useRef, useState } from 'react'
import { getState, setState, useStore } from '../lib/store.ts'
import type { Profile } from '../domain/calculator.ts'
import { validAdultAge } from '../intake/adultAge.ts'
import { checkedRecommendation, recommendationInput, recommendationKey, requestRecommendation, RecommendationError, type Recommendation, type RecommendationFailure } from './recommendations.ts'

export function useRecommendation(profile: Profile, amount: number) {
  const { form, coveragePreferences, recommendation: cached } = useStore()
  const key = recommendationKey(profile, form.age, coveragePreferences)
  const needsAge = !validAdultAge(form.age)
  const validCache = !needsAge && cached?.key === key ? checkedRecommendation(cached.result, amount) : null
  const [finished, setFinished] = useState<{ key: string; retry: number; result: Recommendation | null; failure: RecommendationFailure | null } | null>(null)
  const [retry, setRetry] = useState(0)
  const lastKey = useRef(key)

  useEffect(() => {
    if (validCache || needsAge) return
    const ctrl = new AbortController()
    let active = true
    const changed = lastKey.current !== key
    lastKey.current = key
    const timer = setTimeout(() => {
      const timeout = setTimeout(() => ctrl.abort(), 50000)
      const snapshot = getState()
      void requestRecommendation(recommendationInput(snapshot.profile, snapshot.form.age, snapshot.coveragePreferences), amount, ctrl.signal)
        .then((result) => {
          const current = getState()
          if (!active || recommendationKey(current.profile, current.form.age, current.coveragePreferences) !== key) return
          setState({ recommendation: { key, result } })
          setFinished({ key, retry, result, failure: null })
        }).catch((error: unknown) => {
          if (active) setFinished({ key, retry, result: null, failure: error instanceof RecommendationError ? error.kind : 'unavailable' })
        })
        .finally(() => clearTimeout(timeout))
    }, changed ? 600 : 0)
    return () => { active = false; clearTimeout(timer); ctrl.abort() }
  }, [key, amount, retry, validCache, needsAge])

  const completed = finished?.key === key && finished.retry === retry ? finished : null
  const result = needsAge ? null : validCache ?? completed?.result ?? null
  return { result, needsAge, loading: !needsAge && !validCache && !completed,
    failed: !needsAge && !!completed && !result, failure: completed?.failure ?? null,
    retry: () => setRetry((n) => n + 1) }
}
