import type { PolicyOption } from './recommendations.ts'
import { formatMoney } from '../domain/calculator.ts'

// Display-only examples from apps/backend/policy_catalog.py, never personalized selections.
export type DefaultPolicy = Pick<PolicyOption, 'policyId' | 'name' | 'category' | 'minimum' | 'points' | 'caveat' | 'source'> & {
  maximum: number | null
  ages: [number, number]
  excluded: string[]
  terms: number[]
}

export const DEFAULT_POLICIES: Record<'term' | 'permanent', DefaultPolicy> = {
  term: {
    policyId: 'termaccel', name: 'Lincoln TermAccel Level Term', category: 'term',
    minimum: 100000, maximum: 2500000, ages: [18, 60], excluded: ['NY'], terms: [10, 15, 20, 30],
    points: [
      'Level premiums for the selected term; no cash value.',
      'Electronic application; some qualified applicants may avoid lab work.',
      'Conversion to qualifying permanent policies before the term ends or age 70, whichever comes first.',
    ],
    caveat: 'Approval is underwritten. After the level period, coverage reduces and premiums can increase.',
    source: 'https://www.lincolnfinancial.com/public/individuals/products/lifeinsurance/termlife/lincolntermaccellevelterm',
  },
  permanent: {
    policyId: 'wealthprotector', name: 'Lincoln WealthProtector IUL', category: 'permanent',
    minimum: 100000, maximum: null, ages: [0, 80], excluded: ['NY', 'CA'], terms: [],
    points: [
      'Protection-focused indexed universal life with flexible premiums.',
      '15-year base no-lapse protection requires sufficient premiums.',
      'Optional extended protection has its own funding and transaction conditions.',
    ],
    caveat: 'Lifelong protection needs adequate funding. Index growth is not guaranteed; charges, loans and withdrawals can reduce value and protection.',
    source: 'https://visit.lfg.com/PTR-FACT-FST001',
  },
}

export function defaultQualifications(policy: DefaultPolicy): string[] {
  return [
    `Published coverage minimum: ${formatMoney(policy.minimum)}${policy.maximum === null ? '.' : `; maximum: ${formatMoney(policy.maximum)}.`}`,
    `Published issue ages: ${policy.ages[0]}–${policy.ages[1]}; exact eligibility depends on term length, underwriting class and tobacco status.`,
    `The reviewed shortlist excludes ${policy.excluded.join(' and ')} for this policy.`,
    'Subject to underwriting, current state availability and policy illustration. A licensed professional must confirm eligibility.',
  ]
}
