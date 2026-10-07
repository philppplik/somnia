# Markdown Beta 6 core acceptance tests

Baseline: `7d683246f436374f48a88ae1b3b2506ff98d3807`.

The project uses `tsx --test` and `node:test` for `test:core`. These tests use that runner, add no dependency and change no production code.

## Added coverage

- `mdScrollMap.acceptance.test.ts`: traversal-order independence, nested/equal-start blocks, half-open boundaries, leading/gap/trailing whitespace, resized geometry, empty/zero-height blocks and exact bottom tolerance.
- `mdFormat.acceptance.test.ts`: empty/multiline wraps, selected delimiter removal, backtick selection, partial-line ranges, indentation, blank lines, task toggling, all heading levels, optional code language, table selection, multiple selections, read-only guards and real CodeMirror undo/redo for every formatting command.
- Link insertion uses a real EditorState with a view double. It verifies captured ranges rather than current selection, escaping, shortened-buffer clamping, one dispatch, one undo entry and a focus call. It does not claim to exercise DOM focus or dialog Escape/confirmation behavior; those are covered by the existing `tests/markdown-live-preview.spec.ts` browser suite, not run here.
- `markdownPolicy.acceptance.test.ts`: forbidden and allowed URL schemes, encoded link rejection, remote image resolver isolation, exact reference-image paths, forged mapping attributes, deterministic heading collisions and task/footnote plugin boundaries.
- `markdownI18n.acceptance.test.ts`: component string discovery, all shipped Markdown keys, placeholder parity, view/toolbar/dialog labels and command-palette keys without fallback.

## Known regressions kept executable

Two tests have an explicit `todo` reason and still execute their assertions. Node reports these expected failures as TODO, not as passing assertions. Remove the TODO options only after the product fixes land.

1. Inline code incorrectly unwraps unequal edge backtick runs. Formatting the selected text `` `a``b``` `` currently yields `` a``b`` ``. It should use a four-backtick delimiter with padding, preserving the entire selected text. The delimiter-pair regex accepts a suffix of the closing backtick run as if it matched the opening run.
2. All 18 `cmd.md.*` translation keys are absent in all five shipped catalogues. `listCommands` falls back to English titles. UI `md.*` keys are present, but do not cover command palette lookup.

## Verification

From `phase1/`:

- `npm run typecheck`: passed.
- `npx tsx --test src/lib/*.acceptance.test.ts`: 80 tests, 78 pass, 0 failures, 2 executable TODO regressions.
- `npm run test:core`: 768 tests, 763 pass, 0 failures, 3 pre-existing skips, 2 executable TODO regressions.
- Baseline `test:core`: 688 tests, 685 pass, 0 failures, 3 skips.

No browser tests, rendered UI, IME, real scroll ownership/animation-frame scheduling, Windows WebView2, performance target or visual acceptance were verified by this core-only change. Pure mapping tests cannot prove geometry collection or feedback-loop handling in the mounted application.
