# Somnia Agent integration

Integration branch: `somnia-agent`. Base: `56e2732148d367209b81b65840aeeadebc43027c` (v10.3.0). This branch is not main. No push, release or live paid inference was performed.

## Merge order and resolutions

Merged origin/agent/privacy, core, ollama, diff, panel-ui, docs, mcp-plan in that order, preserving original commits. Package script conflicts combine all test globs, including provider, chat and component tests. Locale add/add conflicts combine privacy and panel keys in every language. For docs/agent/PRIVACY.md, the detailed implemented Privacy-branch document is retained instead of the docs branch's parallel account. The docs branch's other documents remain.

Ollama's duplicate provider.ts has been removed; all providers import the Core contract in types.ts. agentDiff imports the actual Privacy AIProvenance type. The UI contract in core.ts is now a thin adapter boundary, not another inference implementation. The scripted stub remains isolated for its unit tests, but is never the runtime fallback.

## Runtime bridge and assumptions

- panelBridge.ts maps AgentSession text, tool status, usage, completed proposals and errors to panel events. Text/tool-call/usage/finish parsing remains owned by the real providers/session. Proposals are grouped into one complete ChangeSet and also mapped to compatibility AgentProposal.lines. Multiple files are reviewed and applied in one editor transaction.
- Real provider/model selection is available in the panel configuration. Ollama uses the default loopback endpoint. Model names must be entered explicitly; no silent model selection, download or paid call. OpenRouter's key is session-memory-only, never localStorage/chat/history. Native OS keychain integration and discoverable model lists are not implemented.
- Chat is in memory only. New chat resets session, grants and staged proposals. Project generations prevent session/proposal reuse across projects. Cancelling streams and old session observers cannot replay into a replacement chat. A still-stopping session rejects a new turn.
- File context defaults to denied. An unchecked configuration option grants reading the active file; all other reads and every write present an Approval item. Accept once is scoped to that tool invocation. Accept for session persists the specific file/action until reset/project switch. Decline/cancel returns a denied tool result; the model may finish with text, but cannot stage the denied file or apply anything. Filename filtering is not secret detection; users must inspect content before allowing disclosure.
- A write approval includes reading the existing base into the proposal flow. It permits staging only, not applying or saving. Existing complete transcript/tool content remains until chat reset; there is no per-file revocation UX. Provider/config changes reset the transcript.
- Chips fill the composer only. The unimplemented @ attachment marker and @ tip are removed. Selected-element context is not automatically disclosed or expanded into DOM context.
- AgentReview replaces the inline demo diff. Per-hunk/file/all decisions, stale checks, discard and AI labels are wired. An asynchronous autosave hold is followed by a second live stale check. Editor Undo is the existing shared undo command; there is no misleading demo Undo button.
- AI labels and the permanent mistake warning are mounted. Applied provenance is retained in a host memory map, not an exported machine-readable compliance marking. Durable undo/export metadata is still a separate gate.

## Privacy boundary

OpenRouter uses the real shared gate through the full SSE consumption. The Ollama bridge verifies the exact model with /api/show before each request and sets processing:local only from that result. The guarded operation remains alive for the entire body through a single-slot backpressure bridge, not merely until headers arrive. Revocation rejects late buffered output and cancels stream/body consumption. Redirects are blocked. A daemon claiming local weights can lie; this is explicitly not an independent physical-locality proof. Unknown, remote, cloud-backed and unverifiable models require consent. No real provider account/model or paid inference was used in verification.

The shared consent record is currently global, not provider/route-scoped. The Privacy documents retain that release gate. Article 50(2) applicability and exported machine-readable marking are not solved by UI labels. These features are safeguards, not a compliance certification. PRIVACY-PAGE-DRAFT.md remains unpublished. OAuth subscription login, ACP and MCP remain documented future work, not active adapters.

## Applied is not saved

- autosaveHold.ts owns a per-path hold. Native hold_autosave validates every path before registering any hold. The Rust timer skips held paths and clears them only after successful explicit save. Failed/conflicting saves retain the hold.
- fileAdapter's automatic staging skips held paths, so applied content is not written to disk recovery either. Explicit Save stages the latest content while maintaining the native hold, then saves and releases the JS flag only on success.
- main.tsx suppresses memory draft snapshots while any held file exists. A draft contains the complete project, so pausing the whole snapshot prevents indirect persistence of held content.
- Holds survive editor Undo conservatively until explicit save/project close. The optional undo-to-base early release is not implemented; this avoids an unsafe release on redo.
- Closing a disk project with held unsaved content gives an explicit discard warning because held editor content is not in recovery. Native window close now consults the frontend dirty state too, so Rust's lack of a staged journal cannot hide held changes.
- The existing OS-close memory Save flow and Windows interaction still require their normal platform tests. No claim of native Windows certification.

## Physical project boundary

Rust opens the canonical root with cap-std's directory capability. safe_path rejects every symlink component, checks canonical existing ancestors remain under the canonical root, and is used again on read/stage/save. The new hold command calls safe_path before a buffer can be applied. No model receives native handles. The capability-rooted backend remains the write boundary; filesystem race/symlink handling must still be verified on supported platforms. Browser File System Access uses directory handles and exposes no native canonical-path API; its existing handle-relative traversal remains the boundary.

## Verification

- TypeScript noEmit and production build pass; existing dynamic-import warnings are non-fatal.
- Core tests: final totals recorded in parent handoff (three pre-existing skips).
- Native Rust library/service tests pass using --no-default-features, including symlink denial and held agent edits across the autosave deadline, explicit save and subsequent autosave.
- Every Playwright test file was run in bounded groups. The real relay binary was built, and its three initially skipped browser tests were then run successfully. Added provider-fixture integration, access approval, real NDJSON text streaming, hunk apply/undo, native hold/explicit-save, consent and honest unconfigured-error coverage.
- Existing Updates fixtures corrected to a valid v99.0.0 tag and awaited boot before shortcuts. Privacy reload test now awaits boot too. These changes fix test assumptions, not runtime updater behavior.
- Pixels inspected: open panel, consent modal, complete hunk review, streaming text with caret and Stop. Initial consent checkbox spacing was corrected and recaptured.
- No full Tauri desktop-feature build or Windows end-to-end run was performed here. Fixtures do not establish real account/model compatibility, CORS or native provider networking on each OS.

Final local totals: 475 Core tests: 472 pass, 3 pre-existing skips, zero failures. Native library: 9 unit tests plus 24 file-service tests passed. Playwright: all 234 tests in 91 files passed across groups and targeted rechecks; the three relay cases were explicitly rerun after building their prerequisite. Production build and TypeScript are clean. No server, live credential or provider cost was used; all inference responses were local fixtures.
