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
| components/agent | 0 | 0 | 0 | 0 | 0 |
| components/vectorstudio | 0 | 0 | 0 | 0 | 0 |
| components/svgedit | 0 | 0 | 0 | 0 | 0 |
| components/documents | 0 | 0 | 0 | 0 | 0 |
| components/video | 0 | 0 | 0 | 0 | 0 |
| components/design | 4 | 16 | 6 | 1 | 27 |
| components/slides | 18 | 4 | 1 | 2 | 25 |
| components/pdf | 0 | 0 | 0 | 0 | 0 |
| components/diagnostics | 21 | 1 | 0 | 0 | 22 |
| components/interface | 2 | 8 | 11 | 1 | 22 |
| components/sheets | 14 | 6 | 1 | 1 | 22 |
| 14 further areas | 29 | 49 | 1 | 0 | 79 |
| **Total** | **470** | **229** | **57** | **32** | **788** |

The flat `src/components` bucket's largest single debtor was migrated in P23:
`Settings.tsx` and the five sibling Settings files (98 controls) now render
through native control primitives, see below.

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
- P17: pdf/pdfedit areas migrated (107 controls to native
  primitives), ratchet budgets shrunk to zero for all 10 files, adoption tests
  and gallery proof added.
- P18: vs-run-open specificity fix - the run-card override now
  matches the P11 base button rule's specificity and wins by source order, so
  board run cards render as cards again.
- P19: same hardening for vs-back and vs-studio-card.
- P20: vibespace checkboxes keep natural width under the global
  `input{width:100%}` rule, fixing the vertically squeezed hunk filename.
- P21: agent area migrated (48 controls to native primitives),
  ratchet budgets shrunk to zero for all 9 files, adoption tests and gallery
  proof added.
- P22: vectorstudio area migrated (36 controls to native
  primitives), ratchet budgets shrunk to zero for all 6 files, adoption tests
  and gallery proof added.
- P23 (this slice): Settings area migrated (98 controls to native primitives
  across 6 flat files), ratchet budgets zero, adoption test added, capture
  parity proven against a same-tip BEFORE (contract match; 69/72 PNGs
  identical, rest is the dynamic update-check timestamp).
- P24: vectorstudio panel control style moved to real tokens
  (--bg-surface/--border-default/--text-primary); dark theme legible again.
- P25: svgedit area migrated (34 controls to native primitives
  across 6 files), ratchet budgets zero, adoption test and gallery proof
  added (?view=svgedit).
- P26: documents area migrated (33 controls to native primitives
  across 4 files), ratchet budgets zero, adoption test and gallery proof
  added (?view=documents).
- P27: video area migrated (30 controls to native primitives
  across 4 files), ratchet budgets zero, adoption test and gallery proof
  added (?view=video).
- P28: versions area migrated (19 controls to native primitives
  across 8 files), ratchet budgets zero, adoption test and gallery proof
  added (?view=versions).
- P29: photos area migrated (6 controls to native primitives
  across 6 files), ratchet budgets zero, adoption test and gallery proof
  added (?view=photos).
- P30: imageedit area migrated (7 controls to native
  primitives across 3 files: adjustments, filter presets, history),
  ratchet budgets zero, adoption test and gallery proof added
  (?view=imageedit).
- P31: imgedit area migrated (13 controls to native
  primitives across 2 files: crop/transform, selection), ratchet budgets
  zero, adoption test and gallery proof added (?view=imgedit).
- P32: raster editor and layers surfaces migrated (8
  controls to native primitives across 3 files: RasterEditor,
  LayersPanel, LayerContextMenu), ratchet budgets zero, adoption test
  and gallery proofs added (?view=layers, ?view=layers-tree).
- P33: export and conversion dialogs migrated (14 controls
  to native primitives across 2 files: ExportDialog,
  ImageConversionDialog), ratchet budgets zero, adoption test and
  gallery proofs added (?view=export, ?view=convert).
- P34: photos crop guides feature (rule-of-thirds grid in the crop
  overlay with persisted toggle; no raw controls, ratchets unchanged),
  unit tests and gallery proof added (?view=photos-crop).
- P35: photos clipping overlay feature (false-color shadow/highlight
  clipping warning on the preview canvas with persisted toggle; no raw
  controls, ratchets unchanged), unit tests and gallery proof added
  (?view=photos-clipping).
- P36: photos before/after split view feature (original overlays the
  preview, erased right of a draggable SVG divider; no raw controls, no
  new inline styles, ratchets unchanged), unit tests and gallery proof
  added (?view=photos-split).
- P37: photos settings sync feature (copy/paste of full develop settings
  between photos via a validated payload in panel state plus best-effort
  system clipboard; no raw controls, ratchets unchanged), unit tests and
  gallery proof added (?view=photos-sync).
- P38: photos prev/next navigation feature (library-order photo switching
  from the workspace bar with position indicator, clamped ends,
  developable-only filter matching PhotosCanvas; no raw controls,
  ratchets unchanged), unit tests and gallery proof added
  (?view=photos-nav).
- P39: photos zoom presets feature (50/100/200/400% one-click stops in
  the workspace zoom bar with pressed-state tracking, routed through the
  existing clamped zoomTo helper; fit and actual-size untouched; no raw
  controls, ratchets unchanged), unit tests and gallery proof added
  (?view=photos-zoom).
- P40: photos filmstrip feature (Lightroom-style thumbnail strip under
  the workspace bar fed by MediaItem.url, developable-only via the now
  exported developablePhotos filter, aria-pressed active tracking with
  scroll-into-view, setActiveMedia switching; bento.css strip override
  mirroring media-bar; no raw controls, ratchets unchanged), unit tests
  and gallery proof added (?view=photos-filmstrip).
- P41: photos batch export feature (Export-panel batch section writing
  every developable photo through the existing bounded engine export
  into one picked File-System-Access directory with collision-unique
  names, per-photo failure isolation and progress/summary status;
  default-host fallback without directory support; named CSS rule
  instead of a ratcheted pixel-text utility; no raw controls), unit
  tests and gallery proof added (?view=photos-batch).





## Remaining bespoke areas

- **Settings**: migrated in P23. All 98 controls across the six flat Settings
  files render through native control primitives, ratchet budgets are zero,
  and the same-tip capture comparison matches (69/72 PNGs identical; the three
  updates-top shots differ only in the dynamic last-checked timestamp). See
  [settings-adoption.md](settings-adoption.md).
- **Vibespace**: migrated in P16. All 108 controls render through native control
  primitives with their bespoke geometry and behavior intact; file allowances are
  at zero, so reintroduction fails the ratchet. The P11 specificity side effect
  on run cards was fixed in P18.
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
