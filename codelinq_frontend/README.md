# React + TypeScript + Vite

## Combined frontend

This integration uses Justin's Home, Abe artwork, Basics layout, Chat, Review,
and Results screens with the frontend-team questionnaire contract.

- Edit questions in `src/data/assessmentQuestions.ts`. Question IDs, option values,
  helper text, and model-only descriptions are preserved from frontend-team.
- Supported types: `options` (optionally `allowMultiple`), `number-input`, and `text`.
- Complete Basics to view and copy the full assessment JSON, then continue to Abe.
  The same questionnaire snapshot is also available on Results.
- The public payload remains `version`, `assessmentId`, `startedAt`, `updatedAt`,
  `answers`, and `questionDescriptions`. IDs and timestamps survive draft reloads.
- Questionnaire drafts use the existing local-storage key
  `linqlife-assessment-answers`; follow-up chat uses session storage.
  Exit keeps the draft; Start Over clears the draft and current chat.
- `debt` excludes mortgage debt and rent. The chat asks about the mortgage
  separately and never subtracts it from the questionnaire's debt answer.
- Abe currently uses Justin's scripted fallback, not a connected LLM. Chat/review
  data is kept separate from the original questionnaire JSON snapshot.

Use Node 22.14 or newer. From this folder:

```sh
npm ci
npm run dev
npm run build
npm run lint
npm test
```

The original `#assessment` link opens the new Basics screen; new routes use
`#/prepare`, `#/chat`, `#/review`, and `#/results`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
