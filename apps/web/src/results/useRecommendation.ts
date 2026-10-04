import { useEffect, useRef, useState } from 'react'
import { getState, setState, useStore } from '../lib/store.ts'
import type { Profile } from '../domain/calculator.ts'
import { checkedRecommendation, recommendationInput, recommendationKey, requestRecommendation, type Recommendation } from './recommendations.ts'

export function useRecommendation(profile: Profile, amount: number) {
  const { form, coveragePreferences, recommendation: cached } = useStore()
  const key = recommendationKey(profile, form.age, coveragePreferences)
  const validCache = cached?.key === key ? checkedRecommendation(cached.result, amount) : null
  const [finished, setFinished] = useState<{ key: string; retry: number; result: Recommendation | null } | null>(null)
  const [retry, setRetry] = useState(0)
  const lastKey = useRef(key)

  useEffect(() => {
    if (validCache) return
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
          setFinished({ key, retry, result })
        }).catch(() => { if (active) setFinished({ key, retry, result: null }) })
        .finally(() => clearTimeout(timeout))
    }, changed ? 600 : 0)
    return () => { active = false; clearTimeout(timer); ctrl.abort() }
  }, [key, amount, retry, validCache])

  const completed = finished?.key === key && finished.retry === retry ? finished : null
  const result = validCache ?? completed?.result ?? null
  return { result, loading: !validCache && !completed, failed: !!completed && !result, retry: () => setRetry((n) => n + 1) }
}
