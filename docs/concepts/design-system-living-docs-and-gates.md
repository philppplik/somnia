# Design system: living documentation and additive quality gates

Status: proposal only. Source inspection: 2026-10-14, `int/shell` at
`315d1f23a061d07215bdc60d25d3d57d756cbaab`. No runtime code, dependency,
workflow, test or screenshot baseline is changed by this document.

## Decision

Use a developer-only, locally served Storybook React/Vite gallery to document
real Somnia primitives and composed Studio chrome. Use the existing Playwright
stack for local screenshot comparison and GitHub Actions artifacts, not a paid
visual-testing service. Add component/token enforcement in reviewed stages.
The gallery is not the user-facing Components panel and not another Studio.
It must not enter a release bundle or the application's primary interface.

Storybook core is MIT licensed and supports local development and static builds.
No Chromatic account, subscription, cloud upload or proprietary addon is required.
This is a recommended integration, not proof that the current dependency set
accepts a particular Storybook release. Pin compatible versions after a small
installation/build spike, not with an unreviewed `@latest` initializer.

## 1. Verified starting point

| Area | Observed at the pinned commit | Consequence |
| --- | --- | --- |
| Frontend | React 19.3.0, Vite 8.3.2, Tailwind 4.3.3, TypeScript 7.0.2 in `phase1/package.json` | Check exact peer ranges before selecting new tooling |
| Primitives | Six files under `phase1/src/components/ui`: Button, Input, Dialog parts, Tabs parts, Badge, Separator | Start stories with these real exports; do not invent a complete library |
| Primitive implementation | Base UI 1.8.0, CVA variants and `cn` helpers; some arbitrary-size utilities remain | Gallery can expose current behavior before token migration |
| Styles | `src/styles/global.css` imports tokens and named themes; `main.tsx` adds bento and other styles | Load the relevant production styles in their production order |
| Theme choices | `src/lib/theme.ts` includes named light/dark palettes | Enumerate from source, not a second hand-maintained list |
| Studio registration | `src/lib/studios/index.ts` registers Code, Documents, Sheets, Slides, Photos, Sound, Video, Vector, Design, Vibe Space | Cover ten registered workspaces, with fixture evidence per workspace |
| Quality tools | Playwright 1.63.0, core TS tests, dependency-cruiser `check:layers` | Reuse them; there is no ESLint or Storybook entry in the inspected package |
| Current screenshots | `tests/studio-shell-snapshot.spec.ts`: four Code contexts, light, maxDiffPixels 400 | Preserve this suite and its thresholds; it is not all-Studio coverage |
| Current render goldens | Separate fixture config with threshold 0.1, maxDiffPixels 16 and an update guard | Preserve it unchanged; it tests rendered output, not the component gallery |
| CI | `.github/workflows/phase1-core-bootstrap.yml` uses Ubuntu 24.04 and Node 24, runs e2e and blocking render goldens | Add a sibling lightweight gallery job, not a replacement |

Existing [native UI documentation](../design/native-ui/README.md) is the technical
home for component and token contracts. Its older baseline is explicitly dated;
this proposal does not certify every listed historical gap as still present.
The reference checker is `scripts/design-system-reference.mjs` at repository
root, so its documented invocation must be run there, not from `phase1/`.

## 2. Local gallery architecture

Proposed files, not implemented:

```text
phase1/.storybook/main.ts              curated stories and dedicated Vite config
phase1/.storybook/preview.tsx          production CSS, appearance decorators
phase1/.storybook/vite.config.ts       React/Tailwind only; no app bootstrap
phase1/stories/contracts.json          stable story IDs, state and ownership map
phase1/stories/fixtures/               synthetic data and deterministic adapters
phase1/stories/primitives/*.stories.tsx existing exports and variants
phase1/stories/patterns/*.stories.tsx   rails, fields, panels, status and dialogs
phase1/stories/studios/*.stories.tsx    one real composition per Studio
phase1/playwright.design-system.config.ts
phase1/tests/design-system/*.spec.ts   manifest-driven comparisons/interactions
phase1/tests/design-system/goldens/    reviewed canonical Linux screenshots
```

Configure `@storybook/react-vite` with a dedicated Vite configuration through
its supported builder `viteConfigPath` option. This matters: normal `npm run dev`
and `npm run build` enforce real generated engine assets, and app startup installs
storage, diagnostics, native intake and provider flows. A pure-component gallery
must not import `App.tsx`, `main.tsx`, engine initializers or application stores.
Do not remove production prerequisite checks or supply fake production WASM.

Use real primitives and display components, with explicit props or adapter ports.
If a panel only renders after importing an engine/store singleton, record that
coupling as an extraction prerequisite. Keep its integration test in the real
application until the presentational boundary exists. A stubbed file picker or
provider adapter is marked **fixture/simulated**, never **native verified**.

Import `global.css`, then `bento.css`, plus the production styles actually needed
by the displayed pattern. Reuse the same CSS selectors, icon wrapper and theme
helpers. Ensure Tailwind scans story sources as well as production sources.
Avoid a second set of component styles that merely resembles the application.
Restore theme attributes, inline variables, portal roots and mock state after
each story. Portal styling follows the document root, not only a preview wrapper.

Serve on loopback, proposed port 6006. Keep gallery storage on its own origin
and clear it per fixture. Host only bundled fonts, icons and synthetic assets.
Block unintended external requests in tests. No provider keys, user files,
actual projects, telemetry or model calls in a story. Disable Storybook telemetry
using the selected release's documented setting after validating it.
Static output is optional for developer sharing; do not publish it automatically.
The first install needs package downloads; offline development thereafter needs
the installed packages and assets. Static build operation still needs validation.

### Living contract per component

Each gallery entry contains: stable ID; source export/path; owner; actual props
and variants; semantic tokens used; keyboard/focus contract; label/localization
contract; accessibility caveats; relevant Studio adapters; supported states;
test links; and status (`implemented`, `proposal`, `fixture`, `native-unverified`).
Use CSF stories and typed props. Documentation may describe requirements, but
an implemented example must render the production export. No copied markup.

Expose controls for theme, palette, density, UI scale, contrast, motion and locale.
Apply production `resolveTheme`, `applyLook` and `applyUiPrefs` where applicable.
Use actual bounds, such as `Look.uiScale` 85-130, rather than arbitrary values.
System-theme stories use an explicitly emulated system mode for determinism.
Appearance controls must not overwrite the developer's real app preferences.

## 3. Coverage without a combinatorial explosion

| Level | Required initial coverage | Verification |
| --- | --- | --- |
| Primitive | Every real Button variant/size; input default/invalid/disabled; open dialog; tabs selected/keyboard; badge; separator | Light/dark screenshots and focused interaction tests |
| Shared pattern | Icon action, rail item, file tab, inspector field, panel header, unsaved/error status, permission dialog, empty state | Focus/hover/disabled/long label; focus return and Escape where relevant |
| Studio composition | One real chrome fixture for every registered Studio | Light and dark; empty and active selection state |
| Stress | Largest supported UI scale, long German label, high contrast, narrow layout, reduced motion | Selected highest-risk patterns, not every Cartesian combination |
| Palette | Token/swatch and primary-control board per source theme choice | Semantic token assertions and targeted screenshots |

Studio fixtures must carry meaningful context, not the same panel with ten titles:

| Studio | Synthetic active-context fixture | Critical distinction |
| --- | --- | --- |
| Code | HTML with selected node and unsaved tab | View/source controls and document-vs-chrome styling |
| Documents | Paragraph with text selection | Text formatting ownership and page inspector |
| Sheets | Cell range and formula/error display | Cell selection vs application keyboard shortcuts |
| Slides | Slide with selected shape | Slide list, object inspector and ordering |
| Photos | Local synthetic image with edit operation | Non-destructive operation state and export availability |
| Sound | Synthetic clip with selected time range | Transport disabled/busy state and range units |
| Video | Two synthetic clips and playhead | Timeline selection vs preview, disabled export reasons |
| Design | Two artboards and selected object | Artboard navigation vs object controls |
| Vector | Path with selected node | Node vs object tools and coordinate fields |
| Vibe Space | Synthetic task with waiting/failed state | Task permission state; no live agent execution |

For each, distinguish display-fixture behavior from real editing/export support.
The gallery does not prove DOCX fidelity, MP4 export, save/undo, or native dialogs.
Test supported and unavailable actions honestly; do not show working CTA states
for unimplemented operations.

`contracts.json` declares exact mandatory IDs and states. A coverage check must
fail on a missing/duplicate story, missing expected state, or skipped mandatory
test. A discovery loop over only stories that happen to exist is insufficient.
Cross-check the ten Studio IDs against the real registry during a bounded
source/contract test without bootstrapping engines. Add a fixture when a Studio
is registered; fail on stale entries too. Never remove coverage to pass CI.

## 4. Visual regression in existing CI

Proposed package scripts (names are an implementation contract, not runnable now):

```text
npm run gallery:dev       -> storybook dev --host 127.0.0.1 --port 6006
npm run gallery:build     -> storybook build --output-dir storybook-static
npm run check:gallery     -> manifest/export/state coverage checker
npm run test:ui-visual    -> playwright test -c playwright.design-system.config.ts
npm run check:design-system -> component/token lint and exception validation
```

Add `design-system` to the existing Phase 1 validation workflow. Start with
`npm ci`, lint-rule tests, coverage check, static gallery build, the existing
locked Playwright Chromium installation, and gallery screenshot/interaction tests.
A tiny loopback static server serves the build with no engine compile. Use explicit
shell/component/theme/story/config/lockfile path filters, not engine-only rebuilds.
PRs must trigger it; current workflow pushes target `phase1-foundation`, so do not
assume `int/shell` pushes trigger validation. Add intended branch coverage only
in a reviewed workflow change. Include documentation checker paths separately.

Keep current frontend/native jobs, `test:e2e`, `test:core`, layer rules, render
corpus, render goldens and baseline-update guards unchanged. Share only safe
read-only dependency caches; do not cache untrusted screenshots as goldens.
No secrets or write permission are needed for the comparison job. Use public-repo
standard runner capacity within the existing policy; no larger/billable runners.
Actual queue time, duration and account limits remain to be measured.

### Deterministic capture contract

- Canonical runner: Ubuntu 24.04, explicit CPU architecture and locked browser
  revision from the repository Playwright version; record them in artifacts.
- Fix viewport, deviceScaleFactor 1, locale, timezone, reduced-motion preference,
  synthetic timestamps/IDs, media playhead, and all input data.
- Start each story from a clean browser context; wait for fonts, local images,
  and an explicit fixture-ready marker. Do not rely on arbitrary sleeps.
- Capture the preview iframe directly by its stable story ID for controls; use
  composed-fixture pages for larger panels. Do not snapshot Storybook's manager UI.
- Deliberately capture focus, hover and portals as distinct states. Move the mouse
  away for default states; do not crop away a dialog or hide focus outlines.
- Disable screenshot animations, hide only an irrelevant caret, and keep motion
  behavior in separate interaction tests. No broad masking of changing controls.
- Set `updateSnapshots: 'none'` for ordinary CI. Missing goldens fail. Proposed
  initial new-suite limits: threshold 0.1, maxDiffPixels 16, retries 0. Validate
  stability in repeated canonical runs before accepting these new baselines;
  if unstable, fix inputs/fonts/readiness, not global tolerances.
- Never change the existing Code-shell allowance of 400 or render-golden limits
  as part of gallery rollout. New suite limits are independent.

Upload expected/actual/diff images, HTML report, manifest, runner/browser versions
and source SHA on failure, with `if: always()` and bounded retention. Give each
artifact a unique source-SHA name. Failed build/coverage/lint remains a failed
job; artifact collection must not turn it green. Record missing evidence clearly.

Local Windows/macOS runs remain useful for viewing and interaction, but cannot
approve Linux goldens. Docker can improve repeatability but is not a guarantee
across ARM/x86 or browser revisions. Native Windows/macOS Tauri appearance,
OS compositor/glass and file dialogs require separate real-device evidence.

### Reviewed baseline updates

Create candidates in the canonical environment as artifacts, with a reason and
linked intended contract change. A reviewer inspects expected/actual/diff pixels
and confirms every changed ID. Promote approved candidates in a normal reviewed
PR, then rerun comparison with update mode disabled. Record source SHA, environment,
reviewer and reviewed IDs. Do not auto-approve when a component test passes.
Do not invoke the existing `update_snapshots` dispatch: it commits and pushes
shell baselines, and is outside this proposal. A workflow comment about prior
approval is evidence of repository text, not current approval to execute it.

## 5. Enforcement rules with meaningful escape routes

Introduce ESLint flat configuration with a version-compatible TypeScript parser,
a local `somnia-design-system` plugin, and focused rule tests. Select versions
only after confirming TS 7 compatibility. Existing dependency-cruiser remains
responsible for architecture layers; do not replace its rules with lint hints.

| Rule | Target behavior | Safe boundary |
| --- | --- | --- |
| `ui-import-boundary` | Studio chrome uses public UI exports, not Base UI primitives or UI internals directly | Primitives themselves may import Base UI; type-only imports considered explicitly |
| `prefer-shared-control` | New chrome buttons/inputs/dialogs/tabs use existing wrappers | Do not ban checkbox/menu/slider markup until a reviewed compatible wrapper exists |
| `no-chrome-color-literal` | Theme-owned foreground/background/border/focus uses semantic tokens | User artwork, code syntax colors and media pixels are document data, not chrome |
| `no-arbitrary-chrome-style` | Block token bypass through TSX style literals, raw utility palettes and arbitrary colors/radii | Numeric geometry/zoom/coordinates and token-owned variants have bounded exceptions |
| `valid-semantic-token` | References name real public tokens/aliases | Validate declarations and registry; detect unknown tokens even inside `var(...)` |
| `component-contract-covered` | Changed public export/variant has contract and required stories | Source/export coverage check, not only a text grep for a story filename |
| `exception-expiry` | No silent/expired rule suppression or unexplained exclusions | Exact path/node, rule, reason, owner, expiry and tracking reference required |

Use ESLint `no-restricted-imports` for known direct import patterns, backed by
resolved-import checks for aliases, relative paths and re-exports. Check dynamic
imports/require separately; a static import rule does not cover every path.
Custom JSX rules inspect static `className`, `cn`/CVA arguments, template literals
with known parts and object style properties. Flag unresolved token-affecting
expressions for review rather than claiming a perfect static analysis.

Use a parsed CSS declaration check for literal colors, radius, typography and
shadow roles in component-owned chrome CSS. Stylelint's property/value deny rule
is a candidate, not a complete solution: its regexes operate on whole declaration
values and can match strings/URLs. Test Tailwind 4 `@theme`/`@import` compatibility;
use a custom AST visitor for token exemptions and `var` validation. No broad regex
scan that mistakes user document colors for application violations.

Foundation/theme declarations are permitted token owners, not unlimited ignore
zones. Validate token names, duplicate accidental definitions, alias references
and token-cycle safety separately. Legacy primitive arbitrary sizes are inventoried
and migrated deliberately; do not change their pixels opportunistically.

### Migration and test contract

1. Produce a measured inventory with stable violation keys: rule + relative path
   + structural node fingerprint, not line number alone. Classify chrome vs data.
2. Make new files and new violations blocking. Keep legacy entries visible in a
   committed baseline, with per-area owners and migration targets. Never accept
   new violations by regenerating the entire baseline. Detect stale exemptions.
3. Migrate one pattern/Studio at a time. Remove its old entries only after real
   production interaction and pixel review; new wrapper stories are mandatory.
4. Reject new `eslint-disable`, `stylelint-disable`, `@ts-ignore` or raw-lint-ignore
   comments in governed areas unless they resolve to a narrow recorded exception.
5. Add rule fixtures: pass/fail for default/aliased/namespace/re-export imports;
   ordinary and dynamic classes; CVA; TSX styles; portals; CSS functions; document
   artwork; canvas geometry; user color pickers; foundation tokens; expired entries.
6. Confirm failing negative fixtures really fail and valid Studio/document cases
   pass. Keep existing tests intact. Do not use warning-only CI, `|| true`, blanket
   exclusions or `continue-on-error` for newly introduced mandatory gates.

A raw control exemption is warranted for real document content or a specific
unwrapped platform element, not for avoiding a wrapper's missing capability.
If a shared component cannot express the necessary behavior, extend its public
contract with tests and stories or record the migration blocker explicitly.

## 6. Contribution rules and acceptance stages

A UI PR includes the reused component/variant and token rationale; changed contract
and story IDs; interaction tests; before/after images for relevant Studios/themes;
focus, keyboard and localization results; exact commands/environment; and native
or engine gaps. Pixel review does not replace semantic tests or vice versa.

Keep contract prose in `docs/design/native-ui/`, live examples beside gallery
stories, and format-specific functionality in its Studio guide. Link to this
concept from verification documentation when approved rather than duplicating it.

| Stage | Deliverable | Acceptance gate |
| --- | --- | --- |
| A | Dependency/asset spike for six current primitives | Compatible pinned packages; local build; zero external requests; no engine startup |
| B | Contracts, light/dark boards and shared patterns | Required story/state coverage; interaction tests; inspected actual screenshots |
| C | Additive CI and reviewed new goldens | Two stable canonical runs; injected visual/coverage failure blocks CI; artifacts survive failures |
| D | New-violation lint with migration inventory | Tested rules; aliases/dynamic bypass checks; no unexplained suppressions; existing tests unchanged |
| E | Ten Studio fixtures and staged migrations | Every registered Studio mapped; documented adapter gaps; native acceptance separate |

Unknowns: exact Storybook/parser peer compatibility; side-effect-free extraction
cost of current panel components; gallery CSS parity; repeatability of proposed
new screenshot limits; CI runtime and available quota; complete native accessibility
and glass behavior. No install, build, render, browser, lint or CI test was run
for this proposal. No implementation-ready claim replaces these acceptance gates.

## Sources

Read on 2026-10-14. Repository facts come from the pinned checkout and live GitHub
file read; product/framework facts below come from fetched pages, not memory.

- [Storybook React/Vite](https://storybook.js.org/docs/get-started/frameworks/react-vite): local commands, framework, minimum React/Vite requirements. Minimums do not certify this repository's exact versions.
- [Storybook Vite builder](https://storybook.js.org/docs/builders/vite): dedicated configuration through `viteConfigPath` and `viteFinal`.
- [Storybook project](https://github.com/storybookjs/storybook): MIT license and project scope.
- [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots): canonical environment, platform differences, snapshot limits and baseline update behavior.
- [ESLint restricted imports](https://eslint.org/docs/latest/rules/no-restricted-imports): static import patterns, named exports and custom diagnostics.
- [Stylelint declaration values](https://stylelint.io/user-guide/rules/declaration-property-value-disallowed-list): whole-value matching and regex caveats.
- [Independent Docker testing account, 2025-04-10](https://adequatica.github.io/2025/04/10/operating-system-independent-screenshot-testing-with-playwright-and-docker.html): practical environment isolation; its cross-platform framing is limited by the primary evidence below.
- [Playwright issue 13873](https://github.com/microsoft/playwright/issues/13873): public maintainer/community evidence that ARM and Intel screenshot rendering can differ even with containers. Historical issue, not a current-version reproduction.
