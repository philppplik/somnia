# More file types in the code editor

Branch: `feature/more-file-types` (base `phase1-foundation` at v9.18.0).

## What it does
- The code editor picks its mode from the file name: HTML, CSS, JavaScript (`.js .jsx .mjs .cjs`), TypeScript (`.ts .tsx`), JSON (`.json .jsonc .webmanifest .map` and `.babelrc/.eslintrc/.prettierrc`). Everything else stays plain text.
- JSON is new. CSS and JS already had a mode; they now also colour function names, definitions, classes/types, booleans, null, regexps and comments (italic).
- JSON syntax errors show in the editor gutter and in the Problems panel (same path as CSS/JS).
- Apply formatting (Alt+Shift+F / right-click) formats JSON with the indent from Settings.

## Code map
- `phase1/src/lib/languages.ts` (new): `modeFor(file)`, `languageFor(file)`, `highlightStyle`. Uses only the existing `--syntax-*` CSS variables, so all code themes work and no global CSS changed.
- `SourceEditor.tsx`: uses `languageFor` and `highlightStyle` instead of the inline lists.
- `diagnostics.ts`: uses the shared mapping, so JSON is linted too.
- `format.ts`: `json` added (Prettier `json` parser, babel plugin).
- Dependency added: `@codemirror/lang-json`.

## Tests
`src/lib/languages.test.ts` (mode mapping, JSON/JS/CSS diagnostics, JSON formatting). `npm run test:core`, `tsc --noEmit` and `npm run build` pass. No Playwright e2e was run (no browsers in this environment).

## Risks
- Emmet Tab expansion stays HTML/CSS only; unchanged.
- Very large `.json`/`.map` files: lint is skipped above 600 KB (existing limit).
- Highlight colours for new token types reuse existing theme colours, so some tokens share a colour. Cosmetic only.
