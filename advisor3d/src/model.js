// Prototype assessment model. The first five questions deliberately mirror the
// frontend-team quiz (codelinq_frontend/src/data/assessmentQuestions.ts) so both
// apps can share one answers object. The rest are extended questions that cover
// the topics in the team's notes.txt. Mocked: no backend, no real pricing.

export const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');

const money = (id, prompt, help, def, step, max, when) => ({
  id, type: 'number', prompt, help, def, step, min: 0, max, unit: 'money', when,
});

export const questions = [
  // --- mirrors the frontend-team quiz (same order, same answer values) ---
  {
    id: 'hasCoverage', type: 'single', prompt: 'Do you currently have life insurance?', help: 'Through work or on your own.',
    options: [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }],
  },
  { id: 'dependents', type: 'number', prompt: 'How many dependents do you have?', help: 'Children, parents, or anyone you support.', def: 2, step: 1, min: 0, max: 8, unit: 'people' },
  {
    id: 'marital', type: 'single', prompt: 'What is your marital status?', help: 'Pick the one that fits best.',
    options: [
      { value: 'Single', label: 'Single' },
      { value: 'Married', label: 'Married' },
      { value: 'Divorced', label: 'Divorced' },
      { value: 'Widowed', label: 'Widowed' },
    ],
  },
  money('income', 'What is your yearly income?', 'Before taxes. Slide or tap the buttons to adjust.', 60000, 5000, 500000),
  money('debts', 'What is your current total debt?', 'Mortgage, student loans, cards, and car loans combined.', 150000, 10000, 2000000),

  // --- extended questions (3D prototype only, from notes.txt) ---
  money('spouseIncome', "What is your spouse or partner's yearly income?", 'Before taxes.', 40000, 5000, 500000, (a) => a.marital === 'Married'),
  { id: 'yearsIndep', type: 'number', prompt: 'How many years until your dependents can support themselves?', help: 'For children, think of the years until they finish school.', def: 18, step: 1, min: 1, max: 30, unit: 'years', when: (a) => a.dependents > 0 },
  money('resources', 'What savings and investments do you already have?', 'Money your family could draw on.', 30000, 5000, 2000000),
  money('funeral', 'What would final expenses cost?', 'Funeral and burial. A typical range is $8,000 to $15,000.', 10000, 1000, 50000),
  money('longTermIncome', 'How much yearly income would your family need if you were gone?', 'Day-to-day living costs, per year.', 50000, 5000, 300000),
  {
    id: 'horizon', type: 'single', prompt: 'How long should the coverage last?', help: 'Your time horizon.',
    options: [
      { value: '10', label: '10 years' },
      { value: '20', label: '20 years' },
      { value: '30', label: '30 years' },
      { value: 'life', label: 'My whole life', description: 'Permanent coverage' },
    ],
  },
  money('existingCoverage', 'How much life insurance do you already have?', 'Through work or a personal policy.', 100000, 25000, 5000000, (a) => a.hasCoverage === 'Yes'),
  { id: 'age', type: 'number', prompt: 'How old are you?', help: 'Stands in for the identity step (name, address, DOB are skipped in VR).', def: 35, step: 1, min: 18, max: 80, unit: 'years' },
];

export const sampleAnswers = {
  hasCoverage: 'Yes', dependents: 2, marital: 'Married', income: 85000, debts: 280000,
  spouseIncome: 45000, yearsIndep: 18, resources: 60000, funeral: 12000,
  longTermIncome: 90000, horizon: '20', existingCoverage: 150000, age: 38,
};

export const defaultAnswers = () => {
  const a = {};
  for (const q of questions) if (q.type === 'number') a[q.id] = q.def;
  return a;
};

export const visibleQuestions = (a) => questions.filter((q) => !q.when || q.when(a));

// Educational estimate only. Needs = income replacement + debts + final expenses.
export function compute(a) {
  const married = a.marital === 'Married';
  const dependents = a.dependents ?? 0;
  const horizonYears = a.horizon === 'life' ? 30 : Number(a.horizon || 0);
  const years = Math.max(dependents > 0 ? a.yearsIndep ?? 0 : 0, horizonYears);
  const annualGap = Math.max(0, (a.longTermIncome ?? 0) - (married ? a.spouseIncome ?? 0 : 0));
  const income = annualGap * years;
  const debts = a.debts ?? 0;
  const funeral = a.funeral ?? 0;
  const need = income + debts + funeral;
  const resources = a.resources ?? 0;
  const existing = a.hasCoverage === 'Yes' ? a.existingCoverage ?? 0 : 0;
  const covered = resources + existing;
  const gap = Math.max(0, need - covered);
  const suggested = Math.ceil(gap / 25000) * 25000;

  let type;
  let term = null;
  if (gap === 0) type = 'You look covered';
  else if (a.horizon === 'life') type = 'Permanent life (whole or universal)';
  else {
    term = [10, 15, 20, 25, 30].find((t) => t >= years) ?? 30;
    type = `${term}-year term life`;
  }

  return {
    adults: married ? 2 : 1, dependents, years, annualGap,
    income, debts, funeral, need, resources, existing, covered, gap, suggested, type, term,
  };
}

// ---------------------------------------------------------------------------
// Shared answers contract with the 2D frontend (same domain => same localStorage).
// The frontend stores { version: 1, assessmentId, startedAt, updatedAt, answers }
// under 'linqlife-assessment-answers'. We read and write that same shape.
// ---------------------------------------------------------------------------
export const STORAGE_KEY = 'linqlife-assessment-answers';

// internal id -> id used in the saved answers JSON
export const ID_MAP = {
  hasCoverage: 'current-coverage',
  dependents: 'number-of-dependents',
  marital: 'marital-status',
  income: 'income',
  debts: 'debt',
  spouseIncome: 'spouse-income',
  yearsIndep: 'years-until-dependents-independent',
  resources: 'savings-and-investments',
  funeral: 'final-expenses',
  longTermIncome: 'long-term-income-needed',
  horizon: 'time-horizon',
  existingCoverage: 'existing-coverage-amount',
  age: 'age',
};

let meta = { assessmentId: null, startedAt: null };

export function saveToStorage(answers) {
  try {
    const now = new Date().toISOString();
    meta.assessmentId ??= crypto.randomUUID();
    meta.startedAt ??= now;
    const out = {};
    for (const q of visibleQuestions(answers)) if (answers[q.id] !== undefined) out[ID_MAP[q.id]] = answers[q.id];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...meta, updatedAt: now, answers: out }));
  } catch { /* storage unavailable */ }
}

// Returns answers merged over defaults, using anything the 2D app already saved.
export function loadFromStorage() {
  const base = defaultAnswers();
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || saved.version !== 1 || typeof saved.answers !== 'object') return { answers: base, hydrated: false };
    meta = { assessmentId: saved.assessmentId ?? null, startedAt: saved.startedAt ?? null };
    let hydrated = false;
    for (const q of questions) {
      const v = saved.answers[ID_MAP[q.id]];
      if (v === undefined || v === '') continue;
      if (q.type === 'number' && typeof v === 'number' && Number.isFinite(v)) { base[q.id] = Math.min(q.max, Math.max(q.min, v)); hydrated = true; }
      if (q.type === 'single' && q.options.some((o) => o.value === v)) { base[q.id] = v; hydrated = true; }
    }
    return { answers: base, hydrated };
  } catch {
    return { answers: base, hydrated: false };
  }
}
