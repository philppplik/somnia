# Layer rules

Enforced by dependency-cruiser (`.dependency-cruiser.cjs`). Layers, low to high:

1. `packages/editor-core` (no React/DOM packages, no imports from `src/`)
2. `src/lib` root modules (non-UI logic)
3. `src/lib/agent`, `src/lib/studios` and per-studio libs
4. `src/store`
5. `src/components`
6. `src/App.tsx`, `src/main.tsx`

Rules: no upward imports, no import cycles. Test files are not checked.
DOM globals in editor-core cannot be detected by dependency-cruiser; review that by hand.

## Commands

- `npm run check:layers` fails only on violations not in `.dependency-cruiser-known-violations.json`.
- `npm run layers:baseline` regenerates the baseline and the readable list
  `docs/layers-violations.txt`. Only run it after burning violations down; never to
  hide a new one.

The parser is `@swc/core` because dependency-cruiser does not support TypeScript 7 yet.
Switch back to the default parser once it does.
