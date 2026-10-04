# LincLife website

React and TypeScript application for the guided life-insurance assessment.
Answers are interpreted through `POST /api/intake`, validated in the browser,
and used by the local calculator. When the API is unavailable, the chat uses
its labeled scripted fallback.

After the Basics form the site asks how to talk with Abe (`src/intake/Mode.tsx`): text chat
here, or voice in the Quest app. For VR, `src/intake/Vr.tsx` saves the answers so far through
`POST /api/pair`, shows the pairing as a QR code with a six-digit code under it and a short
guide to the headset, and polls until the headset hands the answers back; then it opens
Review. The [backend guide](../backend/README.md) has the API, and
[the Unity guide](../advisor3d-unity/README.md) the headset's side.

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
