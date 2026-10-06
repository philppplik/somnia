# Somnia Agent diff engine

Branch: agent/diff, based on phase1-foundation 56e2732 (v10.3.0).

Implements the review/apply chain from the Somnia Agent concept (section 4: proposal, accepted, saved). Core: `src/lib/agentDiff.ts` (pure, no I/O). UI: `src/components/AgentReview.tsx`. Tests: `src/lib/agentDiff.test.ts`, `src/components/AgentReview.test.tsx` (both in `npm run test:core`).

## Reuse
- Line diff comes from the existing `sourceDiff()` (Phase 1 LCS, bounded at 250k line pairs / 500k chars). It is unchanged. `diffOps()` groups its output into change blocks.
- Display reuses the `.diff-line/.diff-added/.diff-removed` styles and the shared `Button`.
- The existing disk/editor compare dialog (`DiskComparison`) is untouched. It stays the conflict tool for disk changes.

## States
Proposal (isolated, nothing changed) -> Applied (editor buffer only, one undo step) -> Saved (existing save path). The engine only does the first step and produces a plan for the second. It never saves.

## Core interface
```ts
type FileProposal = {path; kind:'create'|'edit'; baseText:string|null; proposedText:string}
type ChangeSet   = {id; complete:boolean; files:FileProposal[]; links?:{hunk:HunkRef; requires:HunkRef; reason}[]}
type Decisions   = Record<hunkKey, 'accept'|'reject'|'pending'>   // hunkKey = `${path}#${index}`

reviewFile(file) / reviewChangeSet(cs) -> FileReview {ops, hunks[], tooLarge, invalid?}
applyHunks(review, decisions)          -> string   // pure merge, accepted hunks take proposed lines
planApply(cs, decisions, readCurrent, {allowPending?}) -> ApplyPlan {ok, writes[], skipped[], blockers[]}
applyReviewed(port, cs, decisions)     -> ApplyPlan // re-plans on live state, then port.applyBatch(writes)
interface AgentApplyPort { read(path): string|null; applyBatch(writes): void|Promise<void> }
```

### What Core must provide
- `read(path)`: current editor text including unsaved edits, `null` if the file does not exist.
- `applyBatch(writes)`: put `writes[].text` into editor buffers (create: new buffer) as ONE undo step. Must not write to disk. Must resolve symlinks and confirm the path stays inside the project root before opening/creating a buffer (the engine only validates the string).

### What the Panel provides
Create a `ChangeSet` from the agent's tool results (one `FileProposal` per file, `baseText` = editor text the agent actually read) and set `complete:true` only after streaming ends. Mount `<AgentReview changeSet readCurrent onApply onDiscard/>`. `onApply` receives a plan with `ok:true`; call `applyReviewed` or `port.applyBatch(plan.writes)`.

## AI provenance
`ChangeSet.provenance` (shape of `createAIProvenance(provider, model)`: generatedBy 'ai', provider, model, generatedAt, humanReviewed) is carried into `ApplyPlan.provenance` and every `PlannedWrite.provenance` with `humanReviewed:true` (the user accepted hunks explicitly). `generatedBy` stays `'ai'` even for partly accepted changes. The type is declared locally in agentDiff.ts because the privacy module is not on phase1-foundation yet; swap for the import after it lands. Core is responsible for persisting the marker (editor/undo metadata, export).

## Rules enforced (all tested)
- Per hunk, per file and all-at-once accept/reject. A hunk is one contiguous change block; hunks are independent.
- Isolated: the engine has no write capability. Originals are never mutated, rejecting deletes nothing.
- Create is a single whole-file hunk and never overwrites an existing file. No delete or rename (out of MVP scope).
- Streaming: `complete:false` blocks every action (UI disabled, plan blocked).
- Stale: exact comparison of `baseText` with current editor text. Any difference blocks. No fuzzy matching. The user re-proposes from the current state.
- Atomic: any blocker (stale, pending hunks, invalid path, dependency, too large, duplicate path) means `ok:false` and `writes:[]`. Files with no accepted hunk are skipped.
- Dependencies: only agent-declared `links` are checked. Accepting a hunk without its required hunk blocks. The engine does not detect semantic dependencies itself (for example class and CSS rule).
- Paths: relative POSIX only. Rejects `..`, `.`, empty segments, absolute and drive paths, backslashes, NUL, any `.git` segment, and secret-like names (.env*, *.pem, *.key, id_rsa, .npmrc, credentials). Case-insensitive duplicates blocked.
- Size: files above 250k chars or above the sourceDiff bound are not reviewable and block the set (fail closed).
- Display: all text is React-escaped, never HTML.

## Assumptions
1. Hunks are change blocks separated by at least one unchanged line, so adjacent edits on neighbouring lines are one hunk. Context (3 lines) is display only.
2. Line endings: split on `\n`, CR kept, so CRLF files round-trip exactly.
3. Pending hunks block Apply by default. The UI only enables Apply with at least one accepted hunk, and the plan then asks for a decision on all others (`allowPending` exists for hosts that treat undecided as rejected).
4. Persistence of proposals across restart is not implemented here. `FileProposal.baseText` is stored with the proposal, so after restart call `planApply` again: staleness is detected the same way.
5. Undo, save conflict handling and Windows/native behaviour belong to Core and need the Windows test. Not verified here.
6. The panel itself, tool loop and OpenRouter are not part of this branch. The component is not mounted in the app yet.

## Not covered
Interaction tests in a real browser (the component has a server-render test only), move/rename/delete, three-way merge, binary files.
