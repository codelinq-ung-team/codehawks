# Frontend — LincLife website

The guided life-insurance assessment: optional Plaid connection, basics quiz,
chat with Abe (or Quest handoff), answer review, and coverage results.

## Stack and flow

React 19, TypeScript 6, Vite 8, and plain CSS. `react-plaid-link` opens the bank
connection UI; `qrcode-generator` creates headset pairing codes. Hash routes
select screens, and `sessionStorage` keeps answers and chat in the current tab.
The browser validates AI readings and calculates the estimate locally. If intake
AI is unavailable, it uses a labeled scripted fallback.

| Source | Responsibility |
| --- | --- |
| `src/App.tsx`, `src/lib/` | Routes, shared state, page layout |
| `src/intake/Prepare.tsx` | Active basics quiz and its question definitions |
| `src/intake/` | Plaid, conversation, headset pairing, review |
| `src/domain/calculator.ts` | Validated profile, coverage math, summary |
| `src/results/` | Results, policy comparisons, follow-up chat |
| `src/guide/`, `src/kit/` | Abe's artwork and shared UI |
| `tests/` | Node tests for calculations, intake, Plaid, and results |

## APIs

All application requests use the [backend](../backend/README.md) through `/api`:

- `POST /api/plaid/link-token` and `/api/plaid/exchange`: connect Sandbox accounts.
- `POST /api/intake`: interpret an answer with the known profile fields.
- `POST /api/recommendations`: compare term and permanent policy options.
- `POST /api/chat`: answer follow-up questions about the results.
- `/api/pair` routes: create and poll a browser/headset handoff.

Provider secrets stay on the backend. Plaid provides account balances, not annual
income. The intake request sends selected known fields, not the raw Plaid response.

## Run and check

Use Node 24. From this directory, with the backend running on port 8000:

```sh
npm ci
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`). Its development
proxy forwards `/api` to `http://127.0.0.1:8000`; no frontend API keys are needed.

```sh
npm test
npm run lint
npm run build
```

The build writes ignored `dist/`. Use the development server above for local API
testing. See the [website guide](../../docs/web-guide.md) for demo scenarios and
detailed behavior, and the [root README](../../README.md) for the combined build.
