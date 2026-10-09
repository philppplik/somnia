# Agent tools in Studios: pattern and integration rules

This is the reference for every Studio that lets an AI agent look at or change
a document. It describes what each Studio module must provide and what the
central integration must do. Photos Develop, Sound and Slides follow it.

The goal is simple. The model can read a bounded, safe projection of a
document and can propose a change. Only the user can apply it. Every apply can
be undone, and undo refuses to run when it could overwrite someone else's work.

## 1. The four-step flow

### 1.1 Inspect (read, JSON only)

- One read tool per Studio, for example `photo_inspect`, `deck_inspect`.
- It returns a whitelisted JSON projection built field by field. It never
  returns a raw object, bytes, pixels, blob or file URLs, EXIF/GPS, XML, or
  engine internals.
- Document strings (slide text, notes, file names) are untrusted data. Mark
  them as document provenance. They are facts, not instructions.
- A parse function validates the full shape strictly: exact key whitelist,
  version, finite numbers, bounded lists, bounded UTF-8 size. No clamping or
  type coercion. Unknown input is rejected.

### 1.2 Propose (strict validation, staged only)

- One propose tool per Studio, for example `photo_propose_settings`,
  `deck_propose_changes`.
- Arguments are a whitelist, including nested keys. Numbers are checked for
  type, finiteness and range. Counts and text sizes have limits.
- Unsupported keys are rejected with an error. They are never ignored or
  faked. If the Studio cannot change something safely (for example slide
  layouts), it is read-only and a proposal that touches it fails.
- Omitted settings keep their current value. A no-op proposal is rejected.
- The tool checks the abort signal and the snapshot (identity, revision, text)
  before staging.
- The tool only stages. It never applies, saves, exports or writes to disk,
  and it never accepts its own proposal.

### 1.3 Reviewed apply (user-owned, shared session store)

- The user reviews a diff and presses accept. A model call can never reach
  apply. Buttons and acceptance stay user-owned.
- Review diffs describe exactly what changes (`diffPhotoDevelop`, `diffDeck`).
  Do not claim a rendered before/after if the module only has a settings or
  text diff.
- Manual edits and AI edits go through one shared session store. Sliders,
  reset, undo/redo and AI apply use the same history. Do not add a second AI
  workspace or a second history.
- Apply re-validates against the live document: same source identity, same
  revision, same reviewed text. If any of these changed, the apply is stale
  and fails.
- Acceptance goes through the central policy, TransactionManager and host
  checks, then the Studio's apply function with an AI origin marker.

### 1.4 Undo protection

Undo of an AI change is allowed only when all of these hold:

- the newest history entry has AI origin,
- the source identity is the same (for example the exact media URL or source
  bytes),
- the monotonic revision is unchanged since the AI apply,
- the current settings or text match what the AI apply produced,
- the history length matches.

Consequences:

- A manual edit followed by a revert (the ABA case) blocks undo. Revision is
  monotonic, so equal content is not enough.
- Manual history moves, source replacement and a later AI edit block undo.
- Consecutive AI-only edits undo in reverse order. Undoing a newer AI edit
  does not clear an earlier manual-change barrier.
- Forget applied origins on close or reset (`forgetPhotoDevelop` and its
  equivalents).

## 2. Module checklist for a Studio

1. Tool module in `lib/agent/<studio>Studio.ts` with inspect and propose tools,
   a strict `parse`/`serialize`, and a registry factory.
2. A document adapter with a stable kind, and a review module with the diff.
3. A workspace module (`<studio>Workspace.ts`) with files/snapshot access,
   reviewed apply, origin-aware undo, forget.
4. A manifest fragment in the Studio's own folder (`agent.tools`, context
   provider names). It does not register anything globally.
5. Tests: strict parse (malformed, unknown, range, duplicate, oversize),
   metadata-only inspect output, partial merge, staged-not-applied, argument
   whitelist, abort, stale snapshot, apply/undo, ABA and replacement barriers.
6. A short doc under `docs/studios/` with validation evidence. State plainly
   what ran in a real browser, what ran only with mocked IPC, and what was not
   run (native Windows/macOS, live model provider).

## 3. Central wiring rules (done by the integrator, never by a Studio agent)

- **Manifest fragments per Studio.** Each Studio ships its own fragment. The
  integrator merges fragments into the central registry. Studio agents do not
  edit the global registry, `panelBridge`, `documentCore` or shared locales.
- **panelBridge sequence.** Wire one Studio at a time, in merge order:
  Documents, Sheets, Slides, Sound, Photos. Rebase, resolve by union (never
  drop another Studio's entries), run the tests, then wire the next.
- **One adapter per kind is not guaranteed.** A kind can have more than one
  adapter. Photos has `raster-stack` and `develop`, both kind `photo`.
  `DocumentRegistry` `kind.find()` returns the first and misroutes. Choose the
  adapter explicitly from the active mode.
- **Await async apply and undo.** Some Studios apply in a worker (Slides ZIP
  editing and WASM reload). The transaction integration must `await` apply and
  undo before it marks a change accepted or undone. Do not fire and forget.
  Extend the shared `TransactionPort` signature if it is `void`.
- **New document identity on source replacement.** A replaced source gets a new
  `documentId`, even when name and settings text are identical.
- **Never send blob URLs or bytes to the model.** Feed only the projected
  snapshot.
- **Unique Studio order and shortcuts.** Orders and `Mod+N` shortcuts must not
  collide. Update the Studio pill specs when a Studio is added.
- **Tauri commands.** Every new `#[tauri::command]` needs entries in
  `build.rs`, `capabilities/editor.json` and the `invoke_handler`.
  `src/lib/tauriPermissions.test.ts` checks this.
- **Generated WASM.** Engines are built by CI from repo source
  (`npm run craft:build`, `documents:build`). Shared prebuilt WASM zips are
  local unblockers only. They are never part of a patch or a release.

## 4. What reviewers should check

- Can any model-reachable path write, save, export or accept? It must not.
- Does inspect leak anything outside its whitelist?
- Does every unsupported field fail loudly?
- Does undo survive the ABA case without overwriting a manual change?
- Is async apply awaited end to end?
- Does the doc say what was not verified?
