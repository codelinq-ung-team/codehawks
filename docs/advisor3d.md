# Advisor3D (WebXR prototype) for agents

The LinqLife guided assessment in a Quest 3S, in VR or passthrough. It is the 2D frontend (`codelinq_frontend`, branch `justin-frontend`) moved into a headset: the same five screens (Home, Basics, Chat with Pip, Review, Results), the same copy, colors and math. Source is in [`advisor3d/`](../advisor3d/); the built site is served at **`https://codelinq.codehawks.org/advisor3d/index.html`** from `app/public/advisor3d/`. It is a prototype: the chat follows the frontend's fixed script, and it needs no backend or AWS changes.

The native Quest app, in Unity, is in [`advisor3d-unity/`](../advisor3d-unity/). It follows the live site's flow and reads answers with the site's AI backend (`POST /api/intake`); its README covers building it onto a headset. It is not part of the site build and does not change anything below.

## Rules that affect everyone deploying this site

1. **`scripts/publish-app.sh` runs `aws s3 sync app/public/ --delete`.** The site is exactly what is in `app/public/` at deploy time. Anything missing there is deleted from S3. If a build empties or replaces `app/public/`, `/advisor3d/` disappears.
2. **`scripts/build-app.sh` is the build adapter.** The deploy workflow runs it, if it exists, right before publishing. It calls `scripts/build-advisor3d.sh`, which runs `npm ci`, builds `advisor3d/`, and writes `app/public/advisor3d/` (Node 20+, preinstalled on `ubuntu-latest`). That output is git-ignored, so it is never committed and always built fresh during deploy. When the 2D frontend gets wired in, add its build and copy its output into `app/public/` **above** the Advisor3D line in `build-app.sh`, and never clear `app/public/advisor3d/` after that line runs. If you replace `build-app.sh`, keep the Advisor3D call.
3. **Link to `/advisor3d/index.html`, not `/advisor3d/`.** CloudFront's default root object only applies to `/`. A request for `/advisor3d/` finds no S3 key and the 403/404 fallback returns the root `/index.html` (the main site). If you want the bare folder URL, ask the infra owner for a CloudFront Function that rewrites a trailing `/` to `/index.html`; that is an `infra/app.json` change.
4. **Do not use root-absolute asset paths inside `advisor3d/`** (`/foo.js`). The Vite config uses `base: './'` so it works under a subpath.
5. **The site's SPA fallback hides mistakes.** Missing files return the root page with status 200, so a wrong path looks like it worked. Before the first Advisor3D deploy, `https://codelinq.codehawks.org/advisor3d/index.html` returns the root "Hello" page. To verify a deploy, check that the page title is `LinqLife Advisor3D` and that `/advisor3d/manifest.webmanifest` is JSON.
6. **Deploys go live immediately and have no approval gate.** Anyone with write access can run **Actions → Deploy hackathon** on `main`. The teardown workflow removes the site, including `/advisor3d/`, at the end of the event.

## Deploying it

1. Merge the PR that contains `advisor3d/`, `scripts/build-app.sh`, and `scripts/build-advisor3d.sh`.
2. Run **Actions → Deploy hackathon → Run workflow** on `main` (leave "verify only" off).
3. Open `https://codelinq.codehawks.org/advisor3d/index.html` on the Quest Browser. Press the menu and choose to install the app to add it to your library. Caching is `max-age=300` and a deploy invalidates `/*`, so updates appear within seconds to minutes.

## What is shared with the 2D frontend

Advisor3D runs the frontend's own logic, so both apps ask the same questions and reach the same number.

- **Copied verbatim from `justin-frontend` (commit `970dcd5`):** `src/domain/calculator.ts` (fields, parsing, the estimate), `src/intake/script.ts` (Pip's questions, "why we ask" text, reply parsing), `src/guide/guide.ts`, and both test files in `tests/`. **Do not edit these copies.** When the frontend changes them, copy the new files over. Once `codelinq_frontend` is on `main`, replace the copies with imports from `../codelinq_frontend/src/`.
- **Ported, not copied:** `src/lib/store.ts` is the frontend's store without React, and `src/guide/pip.js` holds Pip's pixel art from `Avatar.tsx`. Screen copy in `src/screens.js` follows `Home.tsx`, `Prepare.tsx`, `Chat.tsx`, `Review.tsx` and `Results.tsx`. Colors come from `kit/tokens.css` and are listed once in `src/xr/ui.js` (`T`).
- **Session state uses the frontend's key and shape:** `sessionStorage['linqlife:v1']` holding `{ profile, form, messages, pending, started, typing }`. Both apps are on one origin, so a tab that goes from one to the other keeps its answers and its chat. A new tab starts fresh, as it does on the 2D site. The routes are the same hash routes: `#/`, `#/prepare`, `#/chat`, `#/review`, `#/results`.
- The first version of Advisor3D wrote `localStorage['linqlife-assessment-answers']` and had its own questions and formula. That is gone; nothing reads that key now.

## How it is built

- `src/xr/world.js`: renderer, the room, controller and hand rays, the mouse fallback, entering VR or passthrough. Panels hang off `rig`, which moves to the wearer's eye height when a session starts, so it works seated or standing.
- `src/xr/ui.js`: a small UI kit. Each card, button, chip and row is a canvas drawn to match the App Kit and shown on a plane. Layout is in px (1 px = 1.5 mm). Anything with `onSelect` can be pointed at and lifts on hover.
- `src/screens.js`: the five screens. The main card is in front, Pip is on the left, and the right side holds the number pad or side actions. Headsets have no keyboard, so every amount is entered on the number pad or by picking one of Pip's suggestions.
- On Results, the two stacks of blocks in front of you are the estimate: what the family would need, what is already there, and the gap. They use the colors of the dots in the "How we got there" list and move when you change the scenario.

## Working on it

```sh
cd advisor3d
npm ci
npm run dev                 # http://localhost:5173 (mouse to point, number keys for the pad)
npm test                    # the frontend's calculator and script tests; needs Node 22.18+ (CI does not run them)
```

To test on a Quest 3S connected by USB with developer mode on:

```sh
adb reverse tcp:5173 tcp:5173
adb shell am start -a android.intent.action.VIEW -d http://localhost:5173 com.oculus.browser
```

In the Quest Browser press **Enter VR** or **Enter Passthrough**, then point at a button and pinch or pull the trigger. On the deployed HTTPS URL you can also install it as an app from the browser menu (PWA); the manifest and service worker are scoped to `/advisor3d/` and do not affect the main site.

- Demo shortcut: `#/results?sample` (or **See a sample family** on Home) loads a made-up household and opens Results.
- Estimates are educational, not a quote or a recommendation. The math is the frontend's: yearly support × years + mortgage + other debts + final expenses + education, minus existing coverage and savings. It leaves out inflation, investment returns, taxes and Social Security.
- Not built yet: free-text or voice answers (the chat offers suggestions and a number pad), and an AI-backed Pip. `respond()` in `script.ts` is where an AI endpoint would plug in, the same as on the 2D site.

## Ownership

Advisor3D is Israel's prototype and touches only `advisor3d/`, `scripts/build-advisor3d.sh`, `scripts/build-app.sh` (the Advisor3D call), one step in `.github/workflows/validate.yml`, and this doc. Keep other work out of those paths, and ping Israel before changing them.
