# Live-preview render references

32 authored HTML/CSS fixtures, each at 960x640 and 375x640. Coverage includes flex, grid, tables, forms, table-based HTML mail, responsive media/container queries, box geometry, transforms, scroll overflow, typography, RTL flow, local SVG assets, CSS imports, linked scripts and scripts-off reveal content.

## Run

From `phase1/`, after `npm ci` and `npx playwright install chromium`:

```sh
npx tsx --test test/fixtures/render/corpus.test.ts
npx playwright test --config test/fixtures/render/playwright.config.ts
```

The isolated Vite server uses port 1420. Stop other development servers first. This harness does not need the unrelated native WASM builds. It calls the actual `buildPreviewWithResources` pipeline used by `LivePreview.tsx`, including linked CSS/scripts/assets, CSP, scripts consent mode, resource cache and sandboxed srcDoc. It does not mount the application chrome, preview React component, navigation controls or native window. C3 can reuse `manifest.json`, `projectFiles()` and the bundled font to mount these fixtures in its full application/control-hook loop. C4 owns selection-overlay geometry; the corpus includes transforms, nested boxes and scrolling for that work.

Each case checks that local resources loaded, waits for the bundled font and decoded images, then captures two independent srcDoc builds and requires byte-identical PNGs. The first bootstrapped Linux/Chromium reference set is included in this commit. The browser version comes from the repository's pinned Playwright dependency. Use that version on Linux to compare references; browser/OS upgrades are deliberate reference changes, not automatic maintenance. No network fonts or third-party page assets are needed. The unmodified DejaVu Sans test font and its redistribution notice are in `assets/`.

Comparison allows 16 differing pixels with a per-pixel threshold of 0.1. This is a small anti-aliasing allowance, not a percentage of the viewport. Normal runs never create missing references or rewrite them. Failure output and diff images are under `test-results/render/`.

## Intentional design changes

Reference updates need Philipp's approval of the intended visual change and affected fixtures. Inspect old/new/diff images before requesting approval. Save a receipt with the reference to the original authenticated approval, reason, and explicit fixture IDs:

```json
{
  "approver": "Philipp Paulik",
  "source": "Reference to Philipp's original approval of this visual change",
  "reason": "Describe the approved design change",
  "fixtures": ["flex-row", "grid-columns"]
}
```

Then run:

```sh
npx tsx test/fixtures/render/update-goldens.ts /path/to/approval.json
npx playwright test --config test/fixtures/render/playwright.config.ts
```

Only listed fixtures are selected for updates. The runner saves the receipt under `approvals/` after a successful update; commit it with the changed images. Direct Playwright `--update-snapshots` calls without a receipt are refused. Unknown IDs, empty or wildcard scopes and receipts without Philipp's name/source/reason are refused. A receipt is an audit record, not authentication: the person updating references must verify its source and reviewers must check that source. Never manufacture an approval from a failing test.

`SOMNIA_RENDER_BOOTSTRAP=1` is only for the very first empty reference directory and refuses to overwrite existing PNGs. Do not delete the baseline directory to bypass approval. The harness is a developer/test fixture, not a production control channel. No shared scripts, release settings, command foundation files, native ACLs or CI workflows are changed here.

## Integration slots (shared-file owner only)

Suggested scripts:

- `test:render-corpus`: `tsx --test test/fixtures/render/corpus.test.ts`
- `test:render-goldens`: `playwright test --config test/fixtures/render/playwright.config.ts`

CI: `npm ci`, install pinned Playwright Chromium with Linux dependencies, run the two commands above, upload `test-results/render/` on failure. Do not pass update flags in normal CI. An approved regeneration job must receive a reviewed receipt and preserve it alongside the image diff in the PR. Full app screenshots and native Windows/macOS behavior remain separate tests.
