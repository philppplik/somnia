# Design-system audit report

Measured on 2026-10-14 against `origin/int/beta5` `7c13b003`. All numbers come
from `npm run check:ds` (`phase1/scripts/check-ds.mjs`), the same static Babel
measurement the ratchet enforces. This is a source snapshot, not a runtime or
native-platform acceptance claim.

## Enforcement in place

- **Area ratchet** (`ds-baseline.json`): 38 areas, 8 debt metrics each. Any growth
  over the recorded budget fails; `--update` accepts reductions only.
- **File ratchet** (`ds-control-debt.json`): every production file's raw
  `<button>`/`<input>`/`<select>`/`<textarea>` occurrences are capped at their
  recorded allowance. Violations fail with lint-style `file:line` diagnostics that
  point at the [migration guide](migration-guide.md). A migrated file stays listed
  at zero, so reintroduction fails too.
- **Hook inventory** (`ds-hooks.json`): 752 literal test/SDK hooks, 644
  source-backed. Removing a source-backed hook fails the check.
- **Exception policy**: the reviewed exception list is hashed into the baseline;
  `--update` cannot silently expand it.

## Raw control debt

1050 raw form controls remain across 186 files (this base; in-flight slices below):

| Area | button | input | select | textarea | total |
| --- | --- | --- | --- | --- | --- |
| src/components (flat files) | 158 | 118 | 42 | 8 | 326 |
| components/vibespace | 0 | 0 | 0 | 0 | 0 |
| components/extensions | 69 | 13 | 0 | 2 | 84 |
| components/pdfedit | 0 | 0 | 0 | 0 | 0 |
| components/agent | 30 | 13 | 2 | 3 | 48 |
| components/vectorstudio | 12 | 20 | 4 | 0 | 36 |
| components/svgedit | 15 | 17 | 1 | 1 | 34 |
| components/documents | 22 | 6 | 2 | 3 | 33 |
| components/video | 1 | 24 | 4 | 1 | 30 |
| components/design | 4 | 16 | 6 | 1 | 27 |
| components/slides | 18 | 4 | 1 | 2 | 25 |
| components/pdf | 0 | 0 | 0 | 0 | 0 |
| components/diagnostics | 21 | 1 | 0 | 0 | 22 |
| components/interface | 2 | 8 | 11 | 1 | 22 |
| components/sheets | 14 | 6 | 1 | 1 | 22 |
| 14 further areas | 48 | 82 | 14 | 2 | 146 |
| **Total** | **556** | **356** | **99** | **39** | **1050** |

The flat `src/components` bucket holds the largest single debtor:
`Settings.tsx` alone accounts for 75 controls (16 buttons, 38 inputs, 21
selects). Its migration is deliberately gated, see below.

## Non-control debt

| Area | hex literals | px text overrides | inline style objects |
| --- | --- | --- | --- |
| src/styles (excluding tokens.css) | 282 | 0 | 0 |
| src/components (flat files) | 26 | 191 | 70 |
| components/vibespace | 96 | 0 | 5 |
| components/versions | 0 | 41 | 2 |
| components/svgedit | 13 | 16 | 22 |
| components/vectorstudio | 9 | 18 | 18 |
| components/documents | 0 | 27 | 5 |
| components/pdfedit | 5 | 6 | 18 |
| Totals (all areas) | 78 TSX + 423 CSS | 364 | 255 |

## Migrated so far (P0-P13)

- P0: static ratchet, hook inventory, reviewed exception policy.
- P1: token exchange and theme import with bounded `--sc-accent` mapping;
  primitives for button/icon-button/field/native controls/number/range/boolean/
  panel/notice/menu/tooltip/popover; state catalog contract checks.
- P8: imported-theme contrast roundtrip with advisory warnings.
- P9: keyboard/focus regression checklist and evidence.
- P10: gallery index, studio recipes, fixture isolation.
- P11: shared empty/loading/error state adoption in Interface, Animation, 3D and
  Vibe starters.
- P12 (in flight): shared motion/duration tokens with OS reduced-motion override;
  opt-in primitive density. One synchronous 3D focus-containment wait is owned by
  the integrator.
- P13 (in flight): shell chrome controls migrated to native primitives in
  FileTabs, CommandPalette and WindowControls. This base still shows their debt
  (5 buttons, 1 input, 3 buttons) until integration lands.
- P14 (in flight): contributor guardrails - per-file raw control lint ratchet,
  migration guide, this audit. This branch carries P14 stacked beneath P15.
- P15: Extensions area migrated (84 controls to native primitives),
  ratchet budgets shrunk to zero for all 10 files, adoption tests and gallery
  proof added.
- P16: Vibespace area migrated (108 controls to native primitives),
  ratchet budgets shrunk to zero for all 13 files, adoption tests and gallery
  proof added.
- P17 (this slice): pdf/pdfedit areas migrated (107 controls to native
  primitives), ratchet budgets shrunk to zero for all 10 files, adoption tests
  and gallery proof added. This branch carries P14, P15 and P16 stacked beneath
  P17.

## Remaining bespoke areas

- **Settings (`Settings.tsx`, 75 controls)**: migration is gated on the beta.4
  BEFORE artifacts (screens, computed styles, behavior captures). Plan and
  fixtures exist in [settings-migration-plan.md](settings-migration-plan.md) and
  [settings-slice-plan.md](settings-slice-plan.md); no consumer changes until the
  artifacts arrive.
- **Vibespace**: migrated in P16. All 108 controls render through native control
  primitives with their bespoke geometry and behavior intact; file allowances are
  at zero, so reintroduction fails the ratchet. A pre-existing P11 specificity
  side effect (run cards render pill-like because
  `.vs-root button:not([data-slot="button"])` outranks `.vs-root .vs-run-open`)
  is unchanged by the migration and awaits a separate CSS fix.
- **Extensions**: migrated in P15. All 84 controls render through native control
  primitives with their bespoke geometry and behavior intact; file allowances are
  at zero, so reintroduction fails the ratchet. Consent flows already used shared
  Button/Dialog and are unchanged.
- **pdfedit/pdf**: migrated in P17. All 107 controls render through native
  control primitives with their bespoke geometry and behavior intact; file
  allowances are at zero, so reintroduction fails the ratchet.
- **Compound tab strips and context menus**: FileTabs-style hosts keep their div
  structure by design (middle-click, fixed menus, drag behavior); inner controls
  migrate, hosts stay bespoke until a reviewed Tabs/Menu redesign.
- **Document and canvas colors**: VectorCanvas, PenToolEditor, GradientEditor and
  framework templates are reviewed exceptions; document paint is user content,
  not theme debt.
- **Styled Input backing element** (`ui/input.tsx`, 1 input) and the dev harness
  (`src/dev/soundShellHarness.tsx`) carry allowances by record, not exemption.

## Boundaries of this audit

- Actual app and native E2E remain CI-only; browser evidence here is the isolated
  gallery and fixture routes.
- The ratchet measures static literals. Dynamic class construction and computed
  selectors need review, not budget lines.
- Numbers shift as in-flight slices integrate; rerun `npm run check:ds` for the
  current truth. The ratchet files are the ledger; this report is the reading of
  it at the commit above.
