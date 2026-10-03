# Advisor3D (WebXR prototype) for agents

A Quest 3S immersive version of the needs assessment. Source is in [`advisor3d/`](../advisor3d/); the built site is served at **`https://codelinq.codehawks.org/advisor3d/index.html`** from `app/public/advisor3d/`. It uses mock data only and needs no backend or AWS changes.

## Rules that affect everyone deploying this site

1. **`scripts/publish-app.sh` runs `aws s3 sync app/public/ --delete`.** The site is exactly what is in `app/public/` at deploy time. Anything missing there is deleted from S3. If a build empties or replaces `app/public/`, `/advisor3d/` disappears.
2. **`scripts/build-app.sh` is the build adapter.** The deploy workflow runs it, if it exists, right before publishing. It calls `scripts/build-advisor3d.sh`, which runs `npm ci`, builds `advisor3d/`, and writes `app/public/advisor3d/` (Node 20+, preinstalled on `ubuntu-latest`). That output is git-ignored, so it is never committed and always built fresh during deploy. When the 2D frontend gets wired in, add its build and copy its output into `app/public/` **above** the Advisor3D line in `build-app.sh`, and never clear `app/public/advisor3d/` after that line runs. If you replace `build-app.sh`, keep the Advisor3D call.
3. **Link to `/advisor3d/index.html`, not `/advisor3d/`.** CloudFront's default root object only applies to `/`. A request for `/advisor3d/` finds no S3 key and the 403/404 fallback returns the root `/index.html` (the main site). If you want the bare folder URL, ask the infra owner for a CloudFront Function that rewrites a trailing `/` to `/index.html`; that is an `infra/app.json` change.
4. **Do not use root-absolute asset paths inside `advisor3d/`** (`/foo.js`). The Vite config uses `base: './'` so it works under a subpath.
5. **The site's SPA fallback hides mistakes.** Missing files return the root page with status 200, so a wrong path looks like it worked. Before the first Advisor3D deploy, `https://codelinq.codehawks.org/advisor3d/index.html` returns the root "Hello" page. To verify a deploy, check that the page title is `Advisor3D` and that `/advisor3d/manifest.webmanifest` is JSON.
6. **Deploys go live immediately and have no approval gate.** Anyone with write access can run **Actions → Deploy hackathon** on `main`. The teardown workflow removes the site, including `/advisor3d/`, at the end of the event.

## Deploying it

1. Merge the PR that contains `advisor3d/`, `scripts/build-app.sh`, and `scripts/build-advisor3d.sh`.
2. Run **Actions → Deploy hackathon → Run workflow** on `main` (leave "verify only" off).
3. Open `https://codelinq.codehawks.org/advisor3d/index.html` on the Quest Browser. Press the menu and choose to install the app to add it to your library. Caching is `max-age=300` and a deploy invalidates `/*`, so updates appear within seconds to minutes.

## Shared answers contract with the 2D frontend

Both apps are on one origin, so they share `localStorage`. Advisor3D reads and writes the same key and shape as `codelinq_frontend` (`AssessmentAnswersJSON`):

```json
{ "version": 1, "assessmentId": "uuid", "startedAt": "ISO", "updatedAt": "ISO",
  "answers": { "current-coverage": "Yes", "number-of-dependents": 2,
               "marital-status": "Married", "income": 85000, "debt": 280000 } }
```

- Key: `linqlife-assessment-answers`.
- The first five questions in Advisor3D use the frontend's ids and values (`current-coverage` Yes/No, `number-of-dependents`, `marital-status`, `income`, `debt`). Advisor3D also offers Divorced and Widowed.
- Extended answers are extra keys in the same object (`spouse-income`, `savings-and-investments`, `final-expenses`, `long-term-income-needed`, `time-horizon`, `existing-coverage-amount`, `years-until-dependents-independent`, `age`). Extra keys are harmless to the frontend. The id mapping lives in `advisor3d/src/model.js` (`ID_MAP`).
- **If the frontend renames a question id or option value, update `ID_MAP` and the option values in `advisor3d/src/model.js`.** Nothing else needs to change.
- Answers saved in the 2D site prefill the 3D flow, and the reverse.

## Working on it

```sh
cd advisor3d
npm ci
npm run dev                 # http://localhost:5173 (mouse works as a fallback)
```

To test on a Quest 3S connected by USB with developer mode on:

```sh
adb reverse tcp:5173 tcp:5173
adb shell am start -a android.intent.action.VIEW -d http://localhost:5173 com.oculus.browser
```

In the Quest Browser press **Enter VR** or **Enter AR** (passthrough). On the deployed HTTPS URL you can also install it as an app from the browser menu (PWA); the manifest and service worker are scoped to `/advisor3d/` and do not affect the main site.

- Files: `advisor3d/src/model.js` (questions, estimate math, storage), `advisor3d/src/main.js` (scene, interaction).
- Dev hashes: `#quiz=3` jumps to a question with sample data, `#results` shows the results scene.
- Estimates are illustrative, not financial advice. The math is a simple needs formula (income replacement + debts + final expenses, minus savings and existing coverage).

## Ownership

Advisor3D is Israel's prototype and touches only `advisor3d/`, `scripts/build-advisor3d.sh`, `scripts/build-app.sh` (the Advisor3D call), one step in `.github/workflows/validate.yml`, and this doc. Keep other work out of those paths, and ping Israel before changing them.
