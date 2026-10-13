# Photos, Design and Vector header export verification

Base: `origin/int/shell` at `97640259`, with the supplied shared slot patch applied. Local branch: `feat/hero-creative`. No push, release, server/account mutation or deployment was performed.

## Checks run

- 187 focused unit tests passed: `src/lib/photos/*.test.ts`, `src/lib/design/*.test.ts`, `src/lib/vectorstudio/*.test.ts`, `src/lib/shell/hero*.test.ts`, and `HeroActionSlot.test.tsx`, using the repository CSS test loader.
- 2 browser tests passed (light and dark): `npx playwright test --config tests/hero-creative.config.ts`. This source-only config launches Vite directly, not the normal WASM preflight. Set `CHROME_PATH` if system Chrome is elsewhere.
- Design: real SVG, numbered all-artboards ZIP and editable `.somdesign` downloads; ZIP-content unit tests verify safe unique entries and input immutability.
- Vector: real SVG and small PNG download (400x300 page at 2x, 800x600 output), repeated setup focus, whole-page wording and 8192 cap displayed for 4x. PNG used an empty transparent page, verifying encoding/dimensions, not a visual content corpus.
- Photos: ready/empty/crop/busy gates, format memory, Ctrl+Shift+E, Escape, original-copy wording and download host exercised. Browser uses a deterministic engine double. These tests do not verify LightCraft output or PNG/JPEG bytes.
- `check:commands` and `check:ui-commands` passed (283 commands, titles in five locales).
- `check:layers` passed, with its baseline warning that TypeScript 7 has no compatible transpiler in dependency-cruiser. It also reports 87 ignored known violations and 3 stale baseline entries. Do not call this a full TS dependency audit.
- `tsc --noEmit` was run. It fails only at `src/lib/slides/worker.ts:4`, missing generated `slides-engine/pkg/somnia_slides.js`. No replacement declaration or generated engine stub is committed.
- `git diff --check` passed.

## Visual inspection

Inspected actual light/dark Photos/Design popovers and Vector setup screenshots. Popovers stay attached to the header and keep the canvas visible, with 25px corners. Fixed light-theme primary-button text contrast and rechecked pixels. At 900px the hero label hides and the Photos popover remains contained. The surrounding shell has an existing minimum-width layout and can horizontally clip menus/Account below its supported width; this patch does not claim narrow full-shell redesign.

## Unverified

Compiled Photos WASM rendering/encoding and desktop original-safe destination dialogs; Windows/SmartScreen, native downloads, native shortcut mapping, real deployment accounts or Publish send/review behavior. No production build was attempted because generated bridges are absent. JPEG quality, Design PNG/PDF, selection-only Vector export, slices and native destination picking remain outside scope.

## Integration

Apply the supplied shared-slot patch first unless already present. Then apply this series in order: generic refresh/disabled-tooltip fix, Photos, Design, Vector, verification/inventory. Shared code contains no studio-ID branches. All new export actions are UI-only. Publish remains secondary in the shared menu and follows its old availability/review flow.

Roadmap-Delta: Promote Photos, Design and Vector export to the header; add Photos setup/common gate, Design SVG ZIP scope and Vector focus-only setup with capped dimensions. No new export-engine format or remote publishing capability is claimed.
