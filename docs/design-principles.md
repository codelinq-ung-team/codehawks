# Design principles

LincLife helps someone work out how much life insurance their family might need. That is a
question about money and loss, so the product is built around four rules. They are how the
code is organized today, and every change is expected to keep them true.

Read this before changing the calculator, a prompt, anything that calls a model, or anything
that stores or sends what a user typed.

## 1. The calculator owns every number

The estimate is arithmetic on the user's confirmed answers. It is done by plain code, and the
model never supplies, adjusts or rounds an amount.

| What | Where |
| --- | --- |
| The estimate: every term, total and the final figure | `calculate()` in `apps/web/src/domain/calculator.ts` |
| The ten-year look-ahead and what-if scenarios | `outlook()` and `compareScenario()` in the same file |
| The same gap and look-ahead, recomputed by the server | `validate()` and `outlook()` in `apps/backend/recommendations.py` |
| The same math in the Quest app | `apps/advisor3d-unity`, checked by `Tests~/Tests.cs` |

`calculate()` is a pure function: a `Profile` in, an `Estimate` out with each need, each
resource and both totals, so the page renders what it returns and computes nothing itself. A
value the user has not confirmed is `unknown`, which is never treated as zero.

The model has three jobs, and each one is fenced by code:

- **Reading an answer** (`/api/intake`). The model turns "about 85k give or take" into
  `85000`. The server range-checks it, a figure for another field is kept only if it is one
  the user typed (`stated_amounts()` in `intake.py`), and the site shows every reading back
  on the review screen, where the user confirms or changes it before anything is calculated.
  A monthly answer to a yearly question ("6k a month") is held to the typed figure by
  `monthly()` in `intake.py`, whatever arithmetic the model did, and the site asks before
  multiplying it by twelve.
- **Choosing between policies** (`/api/recommendations`). The model picks policy IDs from a
  server-supplied shortlist and writes a short reason. The server sets the amount (the gap it
  computed) and the term length, and the site rejects a response whose amount differs from
  its own calculator's (`checkedRecommendation()` in `apps/web/src/results/recommendations.ts`).
- **Explaining** (`/api/chat`). The site sends the calculator's summary with the question and
  tells the model to quote it, not to work out new amounts.

Instructions alone are not a guarantee, so the model's words are also checked.
`apps/backend/grounding.py` reads every dollar amount in model text. An amount passes if the
user typed it, the site supplied it, or it is one step of arithmetic from those (a sum, a
difference, an amount times a stated count such as years, or a month's or year's worth),
which the server works out itself. A sentence that quotes any other amount is removed before
the text is sent. This covers intake replies, policy explanations and chat. Chat replies are
released a checked sentence at a time, and one that lost a sentence says so.

Known limit: in the Quest app the spoken conversation runs between the headset and the voice
provider directly, so the server cannot check spoken sentences. The amounts shown in the
headset still come from its own copy of the calculator.

## 2. A failure never costs the user their answers

Every call that can fail has a bounded wait, a plain-language message and a way forward.

| Call | Gives up after | What the user gets |
| --- | --- | --- |
| Reading a typed answer | 12 s | The built-in script reads the answer instead |
| Policy comparison | 50 s | "Abe couldn’t compare policies right now", cards that explain the coverage types, and Try Again |
| Questions after the results | 15 s of silence | Abe's written answers, built from the calculator, and a note that the AI is unreachable |
| A reply that breaks off | | The part that arrived, marked as cut off |
| Bedrock, from the server | 5 s to connect, 45 s to read, one attempt | A short reason such as "The LLM request timed out." |
| Plaid, voice, pairing | 20 s, 10 s, 2 s | A message naming the feature that is unavailable |

Answers live in the browser's session store (`apps/web/src/lib/store.ts`), so a failed call,
a retry or a reload keeps them. The server returns a status and a sentence it wrote; a
provider's own error text is never passed on. A fallback is always labeled: the user can tell
a scripted or written answer from the AI's.

## 3. The math is tested

The calculator and the server's copy of it have tests for the main path and the edges: zero
and negative gaps, an unknown required value, skipped optional values, range limits, and the
look-ahead growing, shrinking and staying equal.

```sh
(cd apps/web && npm test)                                      # tests/calculator.test.ts and others
(cd apps && python -m unittest discover -s backend/tests -v)   # test_recommendations.py, test_grounding.py and others
dotnet run --project apps/advisor3d-unity/Tests~
```

The three copies of the math are held together by shared cases:
`test_the_outlook_matches_the_sites_calculator` and `test_shared_calculator_scenarios` in
`apps/backend/tests/test_recommendations.py` use the same households as the website's and the
Quest app's tests. A change to a rule changes all three and their tests in one pull request.

## 4. We keep as little as possible, for as short as possible

Credentials come from the environment or Secrets Manager and are never committed. The names
are listed in [`.env.example`](../.env.example) with placeholders. The model is reached with
the Lambda role, so there is no model key at all.

| What | Where it goes | How long it lasts |
| --- | --- | --- |
| Answers and the chat on the website | The browser's `sessionStorage` | Until the tab closes or the user taps Start Over |
| A typed answer, the question asked and the fields already known | Bedrock, to read the answer | Not stored by us |
| Confirmed answers, age and preferences | Bedrock, to compare policies | Not stored by us |
| Questions after the results, with the estimate summary | Bedrock, to answer them | Not stored by us |
| The Basics form and profile, when pairing a headset | DynamoDB, under an unguessable id | Two hours; the typed code works once and lasts ten minutes |
| Bank balances from Plaid Sandbox | Returned to the browser as a redacted snapshot | The access token is never stored; no account names, numbers or institution ids leave `plaid.py` |
| Speech in the headset | The voice provider, directly from the headset | Never passes through or is stored by our server |
| Call-limit bookkeeping | DynamoDB | Timestamps only, no chat content |
| Server logs | CloudWatch | Seven days; no message bodies, no raw provider errors, and request logging is off |

The backend has no log statements that include what a user typed, and the prompts tell the
model never to ask for names, policy numbers, Social Security numbers or medical records.

`apps/web/src/components/AssessmentPage.tsx` is an earlier prototype that is not routed
anywhere. It writes to `localStorage`, which does not expire; move it to the session store
before putting it on a route.

## When you change something

- A new figure on screen: compute it in `calculator.ts` (and its server and Quest copies),
  return it from the function, and add a test. Do not ask a prompt for it.
- A new prompt or model call: route its text through `grounding.py`, give the call a timeout,
  decide what the user sees when it fails, and stub the provider in tests.
- A new field the model may quote: pass it to `allowed()` so the check knows about it.
- Anything that stores or sends user answers: add a row to the table above, with how long it
  lasts, in the same pull request.
- A new setting: add its name to `.env.example` with a placeholder.
- Never log a request body, a model reply or a provider error.
