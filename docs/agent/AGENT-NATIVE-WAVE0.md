# Agent-native wave0: command and engine-port inventory

Status: In development. Base ac116ae813ae0872b46b8efc51b94a925ae3935e, confirmed descendant of c4c498b2. This is descriptive readiness, not an execution grant.

The regenerated UI inventory contains736 commands after including the previously omitted3D mount registration. The generated `command-readiness.json` contains635 dispatcher rows:630 shared and5 host-scoped raster rows. There are630 distinct dispatcher IDs:106 UI IDs have no dispatcher entry (99 Documents registrations and7 core registrations), while the raster host adds5 rows with IDs already shared. Thus736 UI IDs versus635 host-qualified rows. UI palette and typed dispatcher registries are not equivalent tool surfaces. Dynamic extension/recovery and agent-only Sound host sources remain declared, not silently counted as executable shared tools.

Readiness:627 interactive-only,5 read-schema candidates,2 reviewed-proposal candidates,1 missing-parameter-schema candidate. All engine transaction/undo ports remain explicitly unverified in the generated matrix. A declared schema is not proved semantic safety or current availability; no enabled/run callback is invoked to produce the report. ui origins remain forbidden to agents. No tool registration or execution is added.

Known engine ports for later builder verification: document TransactionManager requires exact reviewed preview/base/policy and history-head authority; deck/sound/photo workspaces have apply/undo adapters but are not universal one-command undo proof. Sheets, Animation,3D and other command families must supply target/effect/preview/commit/undo receipts rather than inherit eligibility from their ID prefix. No general cross-document atomic history exists here.

Run `npx tsx scripts/dump-ui-commands.ts --agent-matrix` and `--agent-matrix --check` from phase1. Check verifies UI title/5locale parity, UI inventory and readiness drift. Missing Photos applyVersion translations discovered on the integrated base are added in all five locales; the check is not weakened. Generated rows include missing result-schema state, invalid name/untype/ui exclusions and host label.

Read-only developer audit component is inspected in an isolated synthetic fixture, not exposed as user runtime permission. Light/dark screenshot tests show candidate vs interactive-only distinction. Native/Rust/WASM/full-app and real model tests are not run. No new dependency/cloud/model download, $0.

## Port evidence and builder work

| Studio | Current source | Required next proof |
| --- | --- | --- |
| Code/text | `documentCore.ts`, TransactionManager, revision/policy check before and after held port | Atomic native history success1/no-op0/failure0 |
| Slides | `deckWorkspace.ts`, async applyDeck/undoDeck, identity/revision and AI-origin check | Awaited engine receipt and native history count |
| Sound | `soundWorkspace.ts`, settings serialize/apply/undo with identity and revision head guard | No-op and failure receipt; wrapper policy (applySound itself lacks origin validation) |
| Photos | `studioWorkspace.ts`, photo/develop bindings and revision snapshot | Independently test adapters and native history count |
| Documents/Sheets/Video | `studioWorkspace.ts`, adapter=null read summaries | Typed mutation adapter and transactional history |
| Animation/3D/other UI | command matrix ui-only | No inherited tool eligibility; scoped targets, preview, commit and undo |

The matrix is static developer evidence, not runtime permission. None of these ports is promoted into an executable command by this slice.
