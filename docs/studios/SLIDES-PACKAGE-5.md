# Slides package 5: native agent tool module

Base: clean package-4 b6c2677bb594388bdff47f706405ad24e8d7be28 (packages 1-4 already present). The integrator rebases centrally on somnia-agent. No push, merge or release. No panelBridge, documentCore, central registry, package.json or shared locale changes.

## Module contract

`lib/agent/deckStudio.ts` follows the supplied Sound module shape:
- `deck_inspect` is read-level. Returns a whitelisted JSON document: dimensions, slide order, internal layout identifiers, canonical text runs and read-only speaker-note strings. No PPTX bytes, rendered pixels, URLs or arbitrary XML/embedded fields. Document strings have untrusted-document provenance. Internal path is not returned to the model.
- `deck_propose_changes` is propose-level. Only `changes: [{slide, run, text}]`, zero-based IDs from inspect. Max 100 changes, no duplicates, 16 KiB UTF-8/XML-safe text per run. Stages through host.propose; does not apply, save or write. Abort and snapshot identity/revision/text checked before staging.
- `parseDeck` validates full JSON strictly: exact nested key whitelist, version, unique known layout identifiers, finite dimensions, ordered slide/run IDs, bounded lists and UTF-8 JSON size. No clamping or type coercion.
- Layouts and notes are inspected, NOT changed. Unknown layouts are rejected. Proposals with layout/notes keys are rejected. PPTX renderer/editor cannot currently safely change them. Noncanonical OOXML remains preview-only instead of guessed editing.
- `deckReview.ts` exposes exact changed text runs for the integrator's review body. No review component or AI panel mounted in this package.

`lib/agent/deckWorkspace.ts` mirrors Sound's metadata files / get / assert / apply / undo / forget callbacks. Apply is reviewed host-only, validates again against live identity, text and revision, and uses the Slides session's original-part-preserving text-copy path. Undo only permits the newest AI origin with unchanged identity, text AND edit revision. Manual edit followed by manual revert still invalidates AI undo. Reopen under the same name cannot inherit the old history. Back-to-back AI changes can be undone in order, without erasing intervening manual history.

Session revision counts successful text mutations, including manual undo/redo. Workspace global revision is a subscription signal and may include rendering changes. Source bytes remain private to the session. Saving is not performed by apply or undo. Dirty handling and Save-as-copy remain existing behavior.

## Integrator wiring, deliberately not edited here

1. Add 'slides' to documentCore StudioKind and `.pptx` routing in studioFor; register deckAdapter. Its exported literal kind currently is 'slides', which deliberately cannot be passed as DocumentAdapter until the shared union is extended.
2. Feed deckFiles()/deckRevision() into document synchronization, createDeckStudioRegistry with the active deck snapshot and staged proposal callback.
3. Mount a review body using diffDeck. Applying belongs exclusively to user acceptance and applicable grants, never model calls.
4. IMPORTANT: Slides applyDeck/undoDeck are async because ZIP editing and WASM reload run in a worker. Unlike Sound's settings setter, the transaction integration MUST await these promises before setting accepted/undone. The current shared TransactionPort apply/undo void signature cannot safely be reused without awaited integration. Do not fire-and-forget. getDeck/assertDeck exclude busy sessions to prevent overlapping mutations. Stale proposal base must be checked before every awaited integration step.
5. Register manifest tools centrally and enable the slides kind only after all this. Manifest names are in studio-local slides.ts, but no tool is live in the production panel yet.

## Evidence

- 18 focused TS tests passed, including strict malformed/unknown/range/duplicate/control/oversize validation, canonical note/layout extraction, staging without application, whitelist/abort/stale snapshot behavior, and original OOXML part preservation.
- TypeScript + Vite production build passed. Existing bundler warnings retained in log; no new type errors.
- Existing production Slides browser suite: 9/9 passed.
- New real-browser module harness: 1/1 passed on dev Vite (imports test-only modules, no production global/debug API). Opens actual independent PPTX in real worker; inspect; stage without applying; reviewed apply; wrong-origin rejection; undo; multiple AI history order; manual edit+revert blocks undo; stale apply rejected; close/reopen identity blocks old undo.
- Pixel inspection of package5-ai-apply.png confirms 'Reviewed AI title' in the rendered slide, thumbnail and text inspector, readable UI and dirty status. This is apply-state evidence, not an AI review-panel screenshot.
- No native desktop/WebView compile rerun. Existing package-3 missing-glib limitation remains. No claim of a live model-provider roundtrip or finished central agent integration.

## Limits

Canonical OOXML regex extraction has the same narrow namespace/relationship syntax limits as the existing editor. Speaker-note strings include canonical text runs (possibly placeholders/page-number text); they are not a semantic notes editor. No layout switching, rich-text formatting, slide add/delete/reorder, media generation or arbitrary binary writes. Structural PPTX intake and expanded ZIP budgets still apply. New JSON metadata/text size cap is 1 MiB; oversized context is rejected, not silently truncated.
