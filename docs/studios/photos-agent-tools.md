# Photos Develop native agent module (package 2)

Base: Photos LightCraft package 1 applied on 769ad33. The live public branch
was f9f1ba94c6acf6aa9d7934bbbf60847d9a572333 when inspected; it did not yet
contain package 1 or Sound. Integrator rebases/assembles the Studio series.

## Tool module

`lib/agent/photoStudio.ts` keeps its existing raster_* tools and stack adapter.
It additionally exports `photoDevelopAdapter` (id photo-develop-settings-v1,
kind photo), strict parse/serialize functions and `createPhotoDevelopRegistry`.

- photo_inspect (read): explicitly projected name, MIME, decoded width/height,
  current exposure/contrast/saturation and permitted ranges. No pixels, URLs,
  EXIF/GPS, source bytes or arbitrary engine fields.
- photo_propose_settings (propose): argument whitelist, nested whitelist,
  strict numeric/finite/range checks, canonical full settings text for review.
  Omitted settings retain current values. No-op and aborted runs are rejected.
  No apply, export, disk writes or automatic acceptance from either tool.

`lib/photos/manifest.ts` exports a Photos-owned manifest fragment with
agent.tools and two context-provider names. It does not register a global Studio
or change any shared registry. Registry/host wiring remains central work.

## Session and reviewed mutation boundary

The existing DevelopPanel settings map moved to `lib/photos/session.ts`; the UI
now subscribes to that one store. Sliders, reset, undo/redo and AI acceptance
use the same history. Metadata becomes ready only after successful worker load
and baseline development. Leaving the panel marks that source not ready for AI.

`photoDevelopWorkspace.ts` exposes files/snapshot access, reviewed apply and
origin-aware undo. It is distinct from existing raster photoWorkspace.ts and
never replaces it. The host still owns source-identity/revision checks before
accepting any proposal. Every settings/history mutation advances a monotonic
revision. Undo requires latest AI origin, same exact media URL, unchanged
revision, matching settings and history length. Manual ABA edits (change away
and back), manual history moves, source replacement and a later AI edit block
undo. Consecutive AI-only edits can be undone in reverse order; undoing a newer
AI edit does not clear an earlier manual-change barrier.

`photoDevelopReview.ts` returns a settings-only diff. This module makes no claim
of rendered AI before/after pixels. Existing Develop preview remains separate.
No new review UI, panelBridge or global registry mutation is part of package 2.

## Integrator wiring

- Merge photoDevelopManifest.agent into the genuine Photos manifest.
- Choose between raster-stack and Develop-settings adapters explicitly. Both
  are kind photo, so blindly appending both to DocumentRegistry's kind-based
  find() would select the first and misroute documents. Use active Photo mode
  to construct/resolve the adapter, context providers and tool registry.
- Feed photoDevelopFiles and photoDevelopRevision to the native document
  boundary; source replacements must get a new document identity, even if the
  name/settings text is identical. Do not serialize a blob URL to the model.
- Bind the tool host to snapshot, projected metadata and review-only propose.
  On acceptance, recheck document revision and exact reviewed text through the
  existing TransactionManager/policy/collaboration-host checks, then call
  applyPhotoDevelop(path, after, origin). On undo call undoPhotoDevelop.
- Bind review cards to diffPhotoDevelop. Buttons must remain user-owned; do not
  call apply from a model tool. Keep raster_* proposal/preview path unchanged.
- Forget applied origins on close/reset through forgetPhotoDevelop.

## Validation and limitations

12 focused tests passed (5 new settings/tool/workspace/review tests, 5 existing
raster Photo tests, 2 existing Develop contract tests). Tests cover strict
parsing, metadata-only output, partial merge, staged-not-applied proposals,
argument whitelist, aborted tools, exact adapter guard, shared session mutation,
latest-origin checks, reversed AI-only undo, manual ABA/history barrier,
replacement/not-ready scope, invalid settings and review diff.
Full application TypeScript compilation (`npx tsc -b`) passed.

The initial npm run build correctly stopped at absent ignored craft assets.
Those runtime assets were later supplied and installed locally, but
photos-engine/pkg JS/WASM was not. A second npm run build reached Vite and
failed explicitly on the missing Photos generated JS module. Package 2 does not claim a new WASM/frontend production build, browser
runtime pass, native pass or fresh visual inspection. Package 1's prior visual
and real-WASM evidence is not being reclassified as package 2 evidence.
CI/integrator must rebuild Photos WASM and rerun photos-develop.spec.ts plus
AI-Photo regressions after assembly. No push, merge or release performed.
