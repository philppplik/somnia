# Design system: phased migration from the current UI

Status: proposal only. No implementation or release is authorized by this document. Development starts only after Philipp reviews the concept.
Baseline: `int/shell` at `315d1f23a061d07215bdc60d25d3d57d756cbaab` (inspected 2026-10-14, shallow clone, nothing built or run). Paths are relative to the repository root.
Scope: slice 4 of 4 of the design system concept. It covers order, risk, effort and safety rails for moving the existing UI onto a design system. What the system contains (tokens, primitives, patterns) belongs to the other slices and to [native UI design system](../design/native-ui/README.md). This page only assumes those exist and says how to adopt them without breaking anything.

## 1. Recommendation

Yes, firm up the UI with shared components, reusable elements and a real design system. Most of the system already exists. The work is adoption, not invention.

- Tokens exist and are documented: `phase1/src/styles/tokens.css`, the Tailwind bridge at the top of `global.css`, [tokens](../design/native-ui/tokens.md), [components](../design/native-ui/components.md).
- Six primitives exist in `phase1/src/components/ui/` (Button, Dialog, Tabs, Badge, Separator, Input).
- Adoption is low and uneven (section 2). Raw controls and hard-coded values dominate.

So the plan is: finish the missing primitives without touching call sites, then move call sites in small, test-guarded steps, cheapest and most visible first, with a ratchet that stops new debt from day one. Do not start with a big-bang rewrite and do not start with Code studio.

## 2. Measured current state

Counts come from `grep` over `phase1/src/**/*.tsx` and `*.css`, excluding test files and `lib/frameworks/templates`. They are approximate (a few lines containing the word "test" are dropped) and exist to size the work, not to be quoted as exact. Re-run them in P0 with a committed script.

| Measure | Count | Reading |
| --- | --- | --- |
| Component files (non-test) | 284 | |
| Files importing a `components/ui/*` primitive | about 105 for Button, 28 for Dialog, 7 for Input | Button adoption is real, fields are not |
| Raw `<button>` | about 420 in about 138 files | Largest group |
| Raw `<input>`, `<select>`, `<textarea>` | 240, 68, 29 | `Settings.tsx` alone has about 59 |
| `style={{` inline styles | about 150 | Mostly geometry, some color |
| Hex colors in TSX | about 100 | Top: `VectorCanvas` 12, `Settings` 10, `PenToolEditor` 6 |
| Hex colors in CSS outside `tokens.css` and `themes/` | about 510 | Top: `global.css` 45, `agent.css` 21, `vibespace.css` 21, `pdf-edit.css` 15 |
| Font sizes as `text-[Npx]` | 157 x 11px, 136 x 12px, 42 x 10px, 16 x 13px | Real scale is 10/11/12/13, never named |
| `border-radius` values in CSS | 6, 8, 10, 12, 14, 16, 25, 999 px all frequent | Scale exists in tokens (`--r-sm/md/lg/control/panel/outer`) but is bypassed |
| Stylesheets outside `styles/` and `themes/` | about 11 feature sheets (vibespace x4, documents, extensions consent, versions, pdf x2, studio pill, visualDiff) | Feature-owned CSS, own conventions |
| Bare element rules in `global.css` | `button`, `input`, `select`, `textarea` get cursor, font, background, border, 4px radius, padding | Raw controls look "designed" already, so mixed pages stay consistent. This is a migration asset and a trap (section 4.2). |

Per-area adoption (raw buttons / raw fields / hex in TSX / inline styles, primitive-importing files):

| Area | Raw btn | Raw field | Hex | Inline | Reading |
| --- | --- | --- | --- | --- | --- |
| `shell`, `studios` | 5 | 4 | 0 | 6 | Small, already mostly clean. Best first target. |
| `photos`, `sound`, `video`, `design` | 4 | 72 | 7 | 28 | Inspector rows: many fields, few buttons |
| `documents`, `sheets`, `slides` | 39 | 24 | 1 | 17 | Buttons, almost no primitives |
| `vectorstudio`, `vectoredit`, `svgedit` | 39 | 44 | 41 | 51 | Hex and inline heavy: partly legitimate canvas colors |
| `pdf`, `pdfedit` | 62 | 45 | 5 | 18 | No primitives at all |
| `vibespace` | 63 | 27 | 0 | 5 | No primitives, own CSS |
| `extensions` | 60 | 15 | 1 | 3 | Consent UI is a security surface |
| `agent` | 25 | 18 | 0 | 2 | Own `agent.css` |

Reading: the problem is repetition more than ugliness. Hundreds of near-identical field rows and small buttons are written out by hand.

## 3. Invariants for every migration PR

These keep the shell refactor, the end-to-end tests and the extension SDK intact. A migration PR that cannot meet one of them is split or dropped.

1. **Zero intended visual change, unless the PR says otherwise.** Adopting a primitive must resolve to the same computed styles as the code it replaces. Deliberate visual changes are separate PRs that Philipp has seen.
2. **Tests are never weakened.** No migration PR edits an assertion, a locator or a snapshot to go green. If a locator breaks, the migration is wrong, or the locator change is a separate, reviewed PR that explains why the new locator tests the same behavior.
3. **Stable hooks stay.** Primitives add `data-slot` and keep existing class names, `data-*` attributes, ids, roles and accessible names. The current end-to-end suite (208 spec files) leans on:
   - about 250 CSS class locators, mostly `.ext-consent` (33), `.ext-popup` (17), `.app-frame` (15), `.store-card` (13), `.ag-answer`, `.settings-search`, `.settings-content`, plus CodeMirror `.cm-*`;
   - attributes such as `[data-storage]` (96 uses) and `[data-rail-item=...]` (36);
   - about 1,500 `getByRole` and about 1,000 test-id usages;
   - CSS variables read by tests: `--accent`, `--bg-panel`, `--gap`, `--glass-frame-alpha`, `--syntax-*`.
   Treat each of these as public API until a P0 inventory says otherwise.
4. **Extension SDK surface is frozen.** Extension panels receive a small theme through `phase1/src/lib/extensions/panelHtml.ts` (four variables: `--text-primary`, `--text-secondary`, `--accent`, `--border-subtle`, plus color scheme) in sandboxed documents. Extension accent palettes set `--accent` on the root (`tests/extension-accent-palettes.spec.ts`). The design system may add variables for the app, never rename or remove these. Exposing more tokens to extensions is a separate, versioned SDK change (see [extension versioning](../extensions/11-versioning.md)), not part of this migration.
5. **Consent UI is frozen in structure.** The extension consent dialog is a trust boundary and has the heaviest test coupling. Migration may change its tokens only. Do not re-compose its markup.
6. **Layers hold.** `src/lib/**` does not import `src/components/**`, and the design system lives under `src/components/ui/` plus `src/styles/`. Studio engines do not import UI. Do not grow the `check:layers` allow-list.
7. **i18n holds.** A primitive never contains user-visible text. Every string a migrated component shows keeps its existing locale key. New strings need all five locales.
8. **Shared files have one owner at a time** (as `AGENTS.md` already requires): `tokens.css`, `global.css`, `bento.css`, `package.json` scripts, `commands.ts`. Phases that touch them are serialized, not parallel.
9. **Shell refactor first.** No migration PR touches `shell/*`, `studios/*` or `lib/shell/*` while a shell package is in flight on the same files. P2 waits for the open shell work to merge.
10. **Native chrome is not verified in the web build.** Frameless window, rounded corners and folder access still need Philipp on Windows. A PR must say so rather than claim it works.

## 4. Mechanics that make it safe

### 4.1 Ratchet, not a rule list

Add one script, `npm run check:ds` (P0), that counts raw `<button>`, raw fields, hex colors in TSX, hex colors in non-token CSS, `text-[Npx]` and inline `style={{` per top-level area, and compares against a committed `phase1/scripts/ds-baseline.json`. The check fails when any number goes up. Numbers only go down; a PR that lowers them updates the baseline. This matches how `check:layers` works with `--ignore-known`. It never needs a big cleanup to start.

Allowed exceptions, listed in the same file with a reason: canvas and document colors (page colors, vector and photo previews, user-authored content), syntax themes, third-party widgets, framework templates.

### 4.2 Primitive parity with the bare element styles

Raw `<input>` already gets background `--bg-surface`, border `--border-subtle`, radius 4 px, padding 6x8 and 100 % width from `global.css`. A new `Input` that is "nicer" would make migrated rows look different from their neighbours, so a half-migrated page would look broken.

Rule: each new primitive first reproduces the bare element exactly. A small Playwright test (P1) renders the primitive and the raw element side by side and compares a fixed list of computed properties in light, dark and high contrast. Improvements come later as token changes, which then restyle both at once.

The bare element rules stay in `global.css` until P6. Removing them early would restyle every unmigrated screen.

### 4.3 Visual proof for areas without coverage

Only one pixel snapshot exists today (`tests/studio-shell-snapshot.spec.ts`, Code studio, Linux). Everything else is covered by role and text assertions, which cannot see a changed radius or color. Therefore P0 records baseline screenshots per studio and per major dialog with the existing web harness (`npm run agent:harness`, see `AGENTS.md`), in light, dark and high contrast. Each migration PR attaches before and after images for its area. These are review evidence, not a new blocking test, until the team trusts their stability (fonts and GPU differ between machines; unverified).

### 4.4 One PR, one surface

Migrate one component file or one panel per PR, with the surface's own e2e spec named in the PR. A swarm may run many such PRs in parallel as long as they do not share files or a shared stylesheet.

## 5. Phases

Effort is a rough estimate in agent-package days (one focused agent package, including review fixes, excluding Philipp's Windows tests). It is a guess from file counts, not a measurement. Risk is for breaking tests, shell or SDK.

| Phase | Goal | Effort | Risk | Visual change |
| --- | --- | --- | --- | --- |
| P0 Quick wins and guardrails | Measure, ratchet, baselines, alias tokens | 2 to 3 | Low | None |
| P1 Complete the primitives | Fields, IconButton, Panel parts, Menu, Tooltip | 4 to 6 | Low | None (parity tests) |
| P2 Shell and studio chrome | Adopt in `shell/`, `studios/`, status bar, rails | 2 to 3 | Medium (shell) | None |
| P3 Settings | Largest single file, 16 sections | 4 to 6 | Medium | None |
| P4 Studio inspectors, one studio per package | Rows, fields, section headers | 1 to 3 per studio | Low to medium | None |
| P5 Dialogs and popups | Close, save, export, publish, store (not consent) | 3 to 5 | Medium | None |
| P6 Debt removal | Hex and size debt, bare rules to `@layer base`, dead CSS | 3 to 5 | Medium to high | Small, deliberate |

Total about 25 to 40 agent-package days, mostly parallelizable after P1. Elapsed time is dominated by review and Philipp's Windows passes, not by writing code.

### P0 Quick wins and guardrails (first, all zero visual change)

1. `check:ds` and `ds-baseline.json` (section 4.1). Pure script, no app change.
2. Per-area baseline screenshots (section 4.3).
3. Inventory of public hooks: a generated list of the classes, attributes and CSS variables the e2e specs and the SDK read, committed next to the ratchet. A migration PR that renames one fails a check.
4. Alias tokens only, no consumers changed yet: a font-size scale for the real values (10, 11, 12, 13 px), a z-index scale, status colors (success, warning, danger, info) that normalize the storage dot, math pill and canvas overlay palettes, and a spacing scale matching the values in use. Add them to `tokens.css` and the Tailwind bridge. Values equal what call sites already use, so nothing moves.
5. Fix the documented custom-accent gap: `applyLook` does not set `--accent-fill`, so the primary Button ignores a custom accent ([tokens](../design/native-ui/tokens.md#3-accent-and-semantic-status)). Smallest change: derive `--accent-fill` the same way as `--accent-soft`. This is the one P0 item with a visible effect, and only for users who set a custom accent. Cover it with a unit test and the accent e2e. Keep it its own PR.
6. Correct stale docs: the component page still says the baseline predates Studio S0/S1.

Why first: cheap, reversible, and it makes every later phase measurable.

### P1 Complete the primitives (no call sites changed)

Build in `components/ui/`, each with the state matrix from [components](../design/native-ui/components.md#10-state-matrix-for-every-new-component), `data-slot`, token-only styling and a parity test (section 4.2):

1. `Field` row (label, control, hint, error, units), which replaces most of the 240 hand-written inspector rows.
2. `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`, `Slider`, `NumberField` (units, min/max, keyboard step). `Input` exists; check it against the bare element first.
3. `IconButton` (the `Button size=icon` case with a required accessible name, enforced by type).
4. `PanelSection` and `PanelHeader`, extracted from `SidebarPanelStack` and `InspectorPanel`, because the shell already has collapse state keyed by studio and panel id. Reuse that behaviour, do not re-implement it.
5. `Menu` and `Tooltip` on Base UI, with keyboard behavior that the custom canvas and layer menus lack today.
6. A development gallery page (the repo already has `d5-preview.html`) rendering every primitive in every state, theme and contrast mode. This doubles as the visual and a11y test target.

Exit: gallery passes the existing `a11y.spec.ts` rules (named controls, visible focus) and the parity tests. No call site uses the new primitives yet.

### P2 Shell and studio chrome

`shell/` and `studios/` already have the fewest raw controls (5 buttons, 4 fields) and the most test coverage (`studios.spec.ts`, `studio-shell-snapshot.spec.ts`, `StudioShellRegressions.test.tsx`, `StudioPill.test.tsx`). Adopt `PanelSection`, `IconButton` and `Tooltip` here first so every studio inherits the result. Do this only after the open shell packages merge. Code studio's snapshot must stay byte-identical; if it changes, stop and find out why.

### P3 Settings

`Settings.tsx` has about 59 fields, 16 buttons and 10 hex colors, and is the screen users see most. It is searchable (`settings-search`, `settings-content` are test hooks) and live-applies with undo, so only the control layer changes, never the section or search model. Migrate section by section (App, Editor, Workflow, AI, ...), one PR each, with `appearance-surfaces.spec.ts`, the accent specs and the settings search specs as gates. Do this before inspectors because it is the best test of `Field` and `NumberField` on real data.

### P4 Studio inspectors, one studio per package

Suggested order, easiest and most uniform first:

1. Sound, Video (mostly field rows, little custom canvas color).
2. Photos (already imports primitives in 11 of 13 files, so this is cleanup).
3. Documents, Sheets, Slides (button-heavy, almost no primitives).
4. Design, then Vector and SVG (hex and inline-heavy; keep canvas, handle and document colors as allowed exceptions, move only chrome colors).
5. PDF (62 raw buttons, no primitives, own CSS).
6. Vibe Space (own four stylesheets and conventions; migrate the controls, keep its shell CSS until P6).
7. Code studio last, and only through tokens and `PanelSection`. It is the reference rendering ("pixel-identical") and has the only snapshot.

Each studio package migrates its inspector panels, its rail panels and its own CSS hex values, and registers nothing new in the shell registry. Per-studio awareness stays where it is: manifests decide which panels exist, the design system only changes how they are drawn.

### P5 Dialogs and popups

28 files already use the `Dialog` primitive, so most of this is consistency: title, description, footer actions, focus, sizes (one small, medium and large size instead of per-dialog widths). Start with close, save and export dialogs. Then publish, deploy and share. Then the extension store and popup (heavy `.ext-popup`, `.store-card` locator use: keep class names and migrate internals). Consent stays as section 3, item 5 says.

### P6 Debt removal (last, can be deliberate visual change)

- Replace remaining hex colors in feature CSS with tokens, area by area. Where a hex is a real design choice with no token, add the token; do not just alias it.
- Replace `text-[Npx]` and arbitrary radii with the scale. Where two values differ by 1 to 2 px, pick one and show Philipp before and after.
- Move bare `button`, `input`, `select`, `textarea` rules into `@layer base` so primitives and utilities always win, then check with the gallery and screenshots. This is the riskiest single change (the cascade is order-based today, see [tokens](../design/native-ui/tokens.md#1-token-ownership-and-cascade)), so it comes after almost everything else is on primitives.
- Delete CSS that no selector reaches (find with the build's coverage, not by guessing).
- Drop the ratchet baseline to zero for the new-code areas and make `check:ds` strict there.

## 6. Ordering rationale

1. Measure and guard (P0), so progress is visible and debt stops growing at once.
2. Build parts without using them (P1), so no screen changes while the parts settle.
3. Smallest, best-tested surface (P2), then the most visible one (P3), then repetition at scale (P4, P5).
4. Visual cleanup last (P6), because it is the only phase where output is meant to change and it needs everything else on primitives to be cheap.

Quick wins in order of payoff per effort: ratchet (P0.1), alias tokens (P0.4), custom accent fix (P0.5), `Field` and `IconButton` (P1), shell chrome (P2), Settings (P3).

## 7. Risk register

| Risk | Where | Mitigation |
| --- | --- | --- |
| Class or attribute rename breaks e2e | All phases | Hook inventory (P0.3); primitives only add attributes |
| Primitive looks different from the raw element next to it | P1 to P5 | Computed-style parity tests (section 4.2); bare rules stay until P6 |
| Cascade order changes which rule wins | P6, any CSS move | Gallery plus screenshots before and after; `@layer base` change is its own PR |
| Shell refactor collides with chrome migration | P2 | P2 waits for open shell packages; one owner per shared file |
| Code studio drifts from its snapshot | P2, P4 | Snapshot test is a hard gate; Code studio last |
| Extension panels or accent palettes break | P0.5, P6 | Frozen variable list; run extension accent and panel specs on every token PR |
| Consent dialog changed by accident | P5 | Out of scope except tokens; `.ext-consent` specs as gate |
| Canvas or document colors "fixed" and corrupt user output | P4, P6 | Allowed-exception list; exports and previews are tested against renders, not tokens |
| Raw `<select>` and number inputs differ from Base UI behavior (keyboard, focus, IME) | P1, P3 | Keep native `<select>` styled as the default; use Base UI only where behavior is gained and tested |
| High contrast, reduced motion or translations clip | All | Gallery covers high contrast and the longest locale; check `de` and `pt-BR` |
| Perf regression from heavier primitives in long lists (layers, files, timeline) | P4 | Virtualized rows (`VirtualProjectRows`) stay raw or use light variants; compare against `PERFORMANCE-BUDGETS.md` |
| Big-PR fatigue, review bottleneck | All | One surface per PR, screenshots attached |

## 8. Stop conditions

Pause a phase and ask Philipp when:

- a visual difference exceeds what the parity test allows and cannot be explained by a bug in the primitive;
- a locator or snapshot needs to change to pass;
- an SDK-visible variable or class would change;
- the same raw pattern appears in more than about 10 places with slightly different looks (a design decision, not a refactor).

## 9. What is not verified

- Nothing was built, typechecked or run. All numbers are static counts on the baseline above, taken by `grep`, and may drift by a few percent.
- Effort figures are estimates, not measurements. Review and Windows test time is not included.
- Only the Code studio has a pixel snapshot. Other studios' current look is unrecorded, so P0 baselines are a prerequisite for claiming "no visual change".
- Windows and macOS rendering (fonts, frameless window, rounded corners) is not covered by the web harness and needs Philipp's test.
- The `d5-preview` page was only noticed as a possible gallery host. Whether it is suitable was not checked.
- The coupling counts for e2e locators come from the specs on disk. Which specs are green on CI today was not checked.
- The other three slices of this concept were not read, so naming of primitives here may differ from theirs. Reconcile before implementation.

## 10. Open questions for Philipp

1. Is a small, deliberate visual cleanup in P6 (unifying near-duplicate radii and font sizes) welcome, or must the UI stay pixel-identical forever?
2. Should native `<select>` stay, or should it become a custom Base UI select everywhere? The first is cheaper and more accessible. The second looks more uniform.
3. Should extensions ever get more theme tokens than the current four? That is an SDK change and needs its own concept.

See also: [native UI design system](../design/native-ui/README.md), [studio shell](studio-shell.md), [studio shell with two sidebars](studio-shell-dual-inspectors.md), [extension documentation](../extensions/README.md), [documentation style](../DOCS-STYLE.md).
