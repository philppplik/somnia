# Vibe Space presentation package

This package exports a real, injected UI without changing App.tsx, the rails,
theme manifests, desktop commands or shared package files. The Rust core owns
runs, consent, isolation, metering and persistence. TypeScript only presents
projections and sends explicit user actions.

## Mount

```tsx
import {VibeSpaceHome} from './components/vibespace';
import {createNativeVibeSpaceTransport} from './lib/vibespace';

// Build once, not on every render. Implement these against the composed native APIs.
const transport = createNativeVibeSpaceTransport(bindings);
<VibeSpaceHome transport={transport}/>;
```

Importing the component index loads scoped CSS. All colors use existing Somnia
surface/text/accent tokens. Panels use 25px corners; controls retain visible
keyboard focus; copyable text and thin scrollbars are preserved. Icons use the
existing Vadivam convention, including the exact upstream `vadivam:bot` glyph.
Its source is https://raw.githubusercontent.com/iconify/icon-sets/master/json/vadivam.json.

## Typed binding boundary

`wire.ts` mirrors core wire v1 including StudioSummary, SpaceSummary, StartRun,
ReviewFile's currentText/currentBytes/conflict, and RunSnapshot. It never carries
API keys or OAuth tokens. Unknown fields are rejected, including nested model,
consent, review and capability fields. Version/identity mismatches are errors.

`NativeVibeBindings` must supply:

- `capabilities`: implemented action types only. Start/Retry cannot be advertised
  until backend + policy + artifact wiring is real.
- `listSpaces(): Promise<SpaceSummary[]>` and `listStudios(): Promise<StudioSummary[]>`.
  A binding may aggregate per-space native queries. These are authoritative
  metadata reads; scopeLabel is display-only, never a filesystem grant.
- `createStudio({spaceId, goal, model}): Promise<StudioSummary>`. Creating a Studio
  persists a session, not a model run. The result is validated and then metadata
  is re-read. The integrator maps the actual native command/argument shape.
- `readSnapshot(): Promise<unknown>` returning this explicit presentation
  collection: `{revision, models: ModelReference[], runs: SnapshotReply[]}`.
  `revision` is the binding's nondecreasing collection-read version, not an
  invented native global event sequence. Each SnapshotReply retains its actual
  persisted per-run sequence and exact wire RunSnapshot. No-run sessions belong
  in listStudios, never in a fictitious RunSnapshot. A read may include history.
- `reviewRequest(command, currentProjection)`: maps the reviewed runId, selected
  file paths and reviewRevision to the real apply/discard baseline request. It
  must preserve those exact selections and must not widen scope. The adapter
  validates them before calling the binding. Rust still checks conflicts and
  takes the pre-apply checkpoint atomically.

An optional `io` is for transport tests only; its default is real Tauri invoke /
listen. It is not a recovery path or mock fallback. Native errors remain visible.

Direct native names are namespaced: `vibespace_choose_folder`,
`vibespace_create_space`, `vibespace_start_run`, `vibespace_stop_run`,
`vibespace_steer_run`, `vibespace_decide_consent`, `vibespace_apply_run`,
`vibespace_discard_run`, `vibespace_restore_checkpoint`. Integration must register
and validate the exact arguments before enabling each action. Native calls use
`{request: <DTO>}`. The helper `nativeCommands` also names create_studio for use by
the injected binding; it does not guess a backend response.

Start takes `{studioId, requestId, retryOfRunId:null}`. Retry takes the same Studio
identity, a new requestId and the old failed run ID as retryOfRunId. Each explicit
firing gets one UUID; there is no automatic mutation retry. Native persists the
request-to-run mapping for idempotency. A transport timeout locks actions until
read reconciliation. The backend must report truthful canStart/latestRunId, so a
reload cannot enable a second firing while the first is still being committed.

Space creation requires the native chooser's folderGrantId. No text input can
authorize a folder. Consent submits only `{runId, requestId, choice}` and cannot
replace targets, arguments or scope. All held consent requests are displayed;
allow_for_run is disabled when the request does not permit it.

## State, events and review

Subscribe before the initial read on `somnia://vibespace-run`. The envelope is
protocolVersion 1, runId, sequence, timestampUtc, kind `run_snapshot`, payload.
Payload is the complete RunSnapshot. Execution and review states stay separate.
Per-run stop/steer/apply/restore controls obey native capabilities, not enum names.
There are no fake pause/resume, scheduling, desktop-control or skills-library
controls. Draft sessions show explicit Start only when native canStart is true.

The controller buffers initial events, ignores duplicates/older sequences, and
keeps a newer run projection when a collection refresh is stale. Gaps trigger an
injected authoritative read and lock effect controls until reconciliation. A
stale reconciliation read stays blocked. Invalid protocol or run/Studio/Space
identity changes remain visible errors. Unmount unsubscribes and invalidates
pending responses. A single pending action prevents duplicate submissions.

Review uses selected files, not pretend hunks. Before/proposed text is split;
conflicts compare current project content against proposed content and also offer
the original baseline. Conflicts cannot be selected or applied. Apply, Discard
and checkpoint Restore have an explicit second confirmation. Changes are not
optimistically marked applied. Binary reviews show byte counts, never decoded
binary content; non-code artifact preview URLs wait for real native delivery.
Not-run checks are shown as Not run, never as success. Cloud cost appears only
when positive, with its price source; absent/zero/local cost is hidden.

## Tests

The existing test:core glob does not include these subtrees. Run from phase1:

```sh
npx tsx --test src/lib/vibespace/*.test.ts src/components/vibespace/*.test.tsx
```

Isolated strict checking with TypeScript 6+ (including TypeScript 7):

```sh
npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --types node,react \
  --jsx react-jsx --target ES2022 --module ESNext --moduleResolution Bundler \
  src/lib/vibespace/*.ts src/components/vibespace/*.tsx \
  src/components/vibespace/assets.d.ts
```

For TypeScript 5 remove `--ignoreConfig`. Production uses the existing Vite
project declarations. No new production dependencies are needed.

Standalone offline browser fixture (esbuild and Playwright must be available):

```sh
npx playwright install chromium
VIBESPACE_SCREENSHOTS=/tmp/vibespace-screens \
  node src/components/vibespace/browser-fixture.mjs
```

`fixture-entry.tsx` and `fixture.ts` are explicit test/development imports. The
production barrel and native adapter never import them. Every fixture UI shows a
persistent test-data indicator. Browser interactions check confirm/cancel Apply,
conflicted selection exclusion, consent Deny, disabled run grants, chooser-gated
creation, create -> draft -> explicit Start, and narrow-view overflow. It saves
light/dark, 430px, review, consent, create and empty-state screenshots for actual
pixel inspection.

## Verification limits

This isolated package was tested using current available tooling installed in a
scratch directory, not by changing the repository's future-version dependency
manifest. A full app build and real Windows/Tauri/provider end-to-end run remain
integration work. Pure transport fixtures cannot prove disk safety, sandbox
strength, actual checkpoint/restore atomicity, billing, or command registration.
English strings are local to this alpha package; shared translation catalogs are
untouched. Sandbox strength is deliberately absent until native enforcement is
measured. The root does not register a Problems source; integration should route
native failures through the existing Problems bridge, while this package already
shows failures and native binding errors in the Vibe Space panel.
