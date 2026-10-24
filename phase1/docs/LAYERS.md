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

## Toolchain and commands

The application stays on TypeScript 7.0.2. Layer analysis has its own locked,
private npm package at `tools/layers`: dependency-cruiser 18.6.0 and TypeScript
6.0.3. This uses the default TypeScript parser and reads `tsconfig.json`, including
path aliases and pre-compilation type dependencies. No compiler downgrade, paid
service, or extra Actions job is required.

After the normal `npm ci`, run `npm run layers:install` once. The existing
frontend validation job does this before the layer tests and gate. The separate
lockfile keeps the analysis compiler out of the application toolchain. Nothing
installs itself during a check.

- `npm run test:layers` checks the compiler isolation, TS/TSX imports, tsconfig
  paths, type-only imports, `import()` type expressions, CTS/MTS cycles, source
  coverage and the intended test/template exclusions.
- `npm run check:layers` fails on new violations, missing toolchain, analysis
  diagnostics, skipped source files, or a stale baseline. Existing known
  violations remain visible as a count.
- `npm run layers:baseline` refreshes the baseline and readable list
  `docs/layers-violations.txt` only after checking that there are no new
  violations. It can remove stale entries and update metadata, but cannot hide
  a new violation. Do not edit the baseline to turn a red gate green.

## TypeScript 6 audit (2026-10-13)

On integration base `0b0b641b`, the old SWC/TS7 run reported 1,346 modules and
4,537 dependencies, with 87 ignored known violations and 3 stale entries. It
also warned `missing-typescript-transpiler`. Installing a supported compiler
revealed 4,556 dependencies and an additional type-only cycle between
`studios/modes.ts` and `studios/registry.ts`. `StudioMode` now lives next to
`StudioViewMode` in registry; modes re-exports it for existing consumers. This
breaks the cycle without changing runtime code or excluding type dependencies.

After that fix: 1,346 modules, 4,555 dependencies, 87 existing violations, no
stale baseline and no environment issues. Eleven existing baseline entries had
changed dependency metadata under the supported TS parser. No new violation
identities were added. The three removed stale entries were:

- `lib-not-up`: `studios/vector.ts` -> `store/appStore.ts`
- `no-circular`: `studios/index.ts` -> `studios/vector.ts`
- `no-circular`: `studios/vector.ts` -> `studios/blank.ts`

The gate is not a typecheck, runtime test or proof that existing layer debt is
fixed. It still deliberately excludes test files and bundled framework
project templates. DOM globals in editor-core need a separate review.

Local validation: clean root `npm ci --ignore-scripts`, isolated `npm ci`, five
layer regression tests, the layer gate and baseline refresh passed. Manual
negative probes confirmed missing toolchain and stale baseline fail; a new
forbidden type import makes both check and baseline refresh fail and leaves
both baseline files byte-for-byte unchanged. A stale probe was removed by
baseline refresh. TS7 `tsc --noEmit` was blocked by the checkout's missing
generated `slides-engine/pkg/somnia_slides.js`; no full build, Windows check or
Actions run was performed for this patch.
