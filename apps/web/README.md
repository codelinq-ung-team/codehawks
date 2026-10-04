# LincLife website

React and TypeScript application for the guided life-insurance assessment.
Answers are interpreted through `POST /api/intake`, validated in the browser,
and used by the local calculator. When the API is unavailable, the chat uses
its labeled scripted fallback.

Review includes optional coverage preferences: age, state, tobacco or nicotine use and
overall health. They never change the calculated gap. Age, state and tobacco decide which
policies and term lengths are eligible; tobacco use or fair health adds a note on the policy
cards that underwriting may mean higher premiums or more medical review. Protection goal,
premium preference and cash-value interest are no longer asked, so they are sent as unknown
and WealthBuilder (shown only for cash-value interest) does not appear. Both typed and VR
assessments finish here.
On Results, Abe compares PR #39's researched Lincoln policies through
`POST /api/recommendations`: two alternative plans for the same calculated gap,
with a **Recommended** banner above the preferred coverage type. Source links,
eligibility qualifications and policy minimum mismatches are shown on the cards.
No premium quotes or underwriting approval are generated. The result is cached only
for the matching answers in this tab; edits invalidate it. Failed requests leave
named **Example policy** cards visible and offer **Try Again**. Missing term options
show Lincoln TermAccel Level Term; missing permanent options show Lincoln WealthProtector
IUL. These display-only examples include published features, limits and sources, even
when unavailable for the user. They are never recommended, cached as selections, or
included as personalized policies in Copy Summary or Ask Abe.

To rehearse without paid inference, run the normal frontend tests and stub the endpoint
using the response shape in `tests/recommendations.test.ts`. Demo family: age 35,
Texas, no tobacco, $40,000 yearly support for 10 years, $150,000 mortgage, $30,000
other debts, $20,000 education and $100,000 existing coverage. The calculated gap is
$500,000. An unavailable backend deliberately
shows general education, never a mocked recommendation presented as live AI.

After the Basics form the site asks how to talk with Abe (`src/intake/Mode.tsx`): text chat
here, or voice in the Quest app. For VR, `src/intake/Vr.tsx` saves the answers so far through
`POST /api/pair`, shows the pairing as a QR code with a six-digit code under it and a short
guide to the headset, and polls while the wearer talks with Abe and then looks at their results
in the headset. When they choose to continue on the computer there, or take the headset off
on their results, it opens Results here (Review, if they had not confirmed their answers), so
the summary can be copied and explored. The [backend guide](../backend/README.md) has the API, and
[the Unity guide](../advisor3d-unity/README.md) the headset's side.

## Looking ahead

The estimate is a snapshot of today, and people early in life noticed. So the chat ends with
two optional, one-tap questions about the next ten years (`src/intake/script.ts`): which
changes they expect (kids, a home, a partner; stored as one number, see `PLANS`) and where
they expect their income to be. Nothing earlier in the chat moves, and neither answer changes
the estimate. `outlook()` in `src/domain/calculator.ts` turns them into a second figure, what
the need could grow into, from rules the assessment already states: support keeps its share
of income, kids or a partner mean at least 70% of income (with the what-if step's child: 18
years of support and an education fund), and a home is a mortgage of three times income.
The site uses it in three places and adds no screen for it: the summary text (so Copy
Summary and Ask Abe carry it), Abe's written answer about the future, and the what-if step,
which opens with "Another child someday" switched on for someone who expects kids. The Quest
app draws it in the room. `apps/backend/recommendations.py` holds the same rule, to tell the
model the need may grow without ever sizing a recommendation to it; the three copies share
test cases.

## Development

Use Node 24. From this directory:

```sh
npm ci
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8000`. To start the API, see the
[backend guide](../backend/README.md). The root [README](../../README.md)
has complete setup and validation commands.

## Checks and build

```sh
npm test
npm run lint
npm run build
npm run preview
```

`src/domain/` owns the calculator; `src/intake/` owns the conversation flow.
Their existing tests live in `tests/`. `npm run build` writes ignored `dist/`.
From the repository root, `bash scripts/build-app.sh` builds this application
and WebXR into ignored `build/site/` for deployment. Keep this application's
package manifest and lockfile together; it has no root npm workspace.
