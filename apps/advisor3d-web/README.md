# Advisor3D — WebXR prototype

A browser-based VR/passthrough assessment for Quest, built with Three.js, WebXR,
JavaScript/TypeScript, and Vite 6. It is separate from the
[native Unity app](../advisor3d-unity/README.md).

`src/screens.js` builds the screens; `src/xr/` renders the room and interactive
panels. `src/intake/script.ts` runs the scripted conversation, `src/domain/` does
the coverage math, and `src/lib/store.ts` keeps tab-session state. This prototype
makes no backend, Bedrock, or Plaid API calls. It uses browser WebXR and canvas
APIs, with a mouse fallback and a service worker for the installable website.

Use Node 24. From this directory:

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite prints the local URL; use a separate port if the main website is running.
Build output is ignored `dist/`, copied to `build/site/advisor3d/` by the combined
site build. The deployed entry is `/advisor3d/index.html`.

See the [WebXR guide](../../docs/advisor3d.md) for headset setup, ownership,
shared-logic constraints, and deployment details.
