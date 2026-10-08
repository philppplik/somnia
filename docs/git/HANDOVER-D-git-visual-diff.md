# Package D: static visual diff

Base: `77cd526` on `somnia-agent`. Local branch: `agent/git-git-visual-diff`.
Delivery is an uncommitted patch. No push, runtime network, new dependencies, Git command wiring or mutations.

## Apply

From the repository root: `git apply --check git-visual-diff.patch`, then `git apply git-visual-diff.patch`.
The only shared-file edit is appending `src/lib/visualDiff/*.test.ts` to phase1/package.json test:core. Merge that glob by append/union if other packages changed the script. No locales, contract types, Rust, app store or versions components changed.

## Integrator API

Import `VisualDiff`, `loadGitComparison` and associated types from `phase1/src/lib/visualDiff`.

```tsx
<VisualDiff comparison={{
  path: 'pages/index.html',
  before: {label: 'HEAD', files: beforeFileSet},
  after: {label: 'Worktree', files: afterFileSet},
}} />
```

Snapshots are readonly text maps. Missing keys mean missing files; empty strings remain empty files. Pass distinct complete maps for each side, including CSS if available. No disk or project-store access happens inside the viewer.

`await loadGitComparison(backend, path, 'head', 'worktree')` adapts the existing GitBackend.diff seam. It validates path/state response matching and propagates binary/tooLarge. Since GitFileDiff contains one file only, this adapter cannot retrieve linked CSS: those dependencies produce visible incomplete-resource warnings. The integrator should supply full in-memory historical file sets when available. The adapter calls no staging, status, commit, restore, init or network operation. Errors propagate to the caller; retain its current loading/error/stale-request handling.

Attach the component in the Versions diff/detail surface; no application routing is changed in this package, to avoid competing ownership with B/C.

## Behavior and honest limits

- Slider overlays equal-width, equal-height before/after previews. Range supports native keyboard operation, including endpoints.
- Side by side uses the same fixed viewport dimensions, horizontal overflow and clear labels.
- Only changes reuses existing sourceDiff + sideBySide; it shows changed source rows with +/- and line numbers, not a pixel-difference algorithm or visual-region detection.
- HTML preview only. Other file formats use text changes; binary comparison is unavailable.
- Opaque `sandbox=""` iframes, no allow-scripts/same-origin; first-head CSP denies remote data, media, scripts, forms, frames, fonts, images and connections. Markup is parse5-parsed and allowlisted. Project CSS is inlined only from the supplied map. CSS URLs/imports are blocked by CSP; animation/transition disabled. No script is injected, including comparison helpers.
- Images, SVG, forms, unsupported/active markup are omitted with warnings. These static approximations cannot reproduce dynamic layouts. There is no claim of a complete render.
- Fixed 540px height crops tall content; UI states this and offers 320/768/960/1440px widths. Both snapshots have matching dimensions. Long paths wrap. Preview region is focusable for horizontal keyboard scrolling; mode selection uses buttons with pressed state.
- 1 MiB UTF-8 total preview content and 2000-file guard. Incomplete snapshots are not visually rendered. Text-diff bounds reuse the existing sourceDiff implementation. Large input reports unavailable rather than silently claiming no differences.
- UI strings are currently English inside the owned module; localization needs a subsequent union-key integration if required. No locale files were changed.

## Validation

- npm ci --ignore-scripts completed without lockfile changes.
- npm run build: pass (tsc -b + Vite), existing large-chunk/dynamic-import warnings.
- npx tsc --noEmit: pass.
- Focused module tests: 6/6 pass. Covers Fake GitBackend, missing/empty/binary/large files, response mismatch, CRLF preservation, Unicode/space/newline paths, traversal/NUL/absolute rejection, HTML/CSS injection, missing CSS and size limits.
- Full npm run test:core: 1469 tests, 1425 pass, 0 fail, 18 skipped, 26 todo. 84 seconds. After that run, validation fixtures were relocated into the owned module and preview doctype normalized; focused tests, full build and browser check rerun successfully.
- Browser harness: `cd phase1 && node src/lib/visualDiff/validation/browser.mjs`. Uses installed Chrome at /usr/bin/google-chrome and the existing Playwright dependency. Validates zero external requests with malicious HTML/CSS URLs, no project script execution, opaque sandbox, range ArrowRight, all modes, and 390px dark surface without whole-page overflow. Fixture is only accessible as a validation page, not wired into the shipped UI.
- Screenshots inspected: slider, side-by-side, only-changes, narrow/dark. Controls and warnings are readable, rounded surfaces fit, source rows escape HTML, horizontal cropping stays inside the preview.
- Windows Tauri WebView, macOS, real application embedding, real repository snapshots, screen-reader behavior and multilingual labels still require integration/manual checks.

## Files

All new implementation, tests and browser fixtures: phase1/src/lib/visualDiff/**.
Shared: phase1/package.json (append one test glob).
