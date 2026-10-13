# Local commit review and restored ref seam

ChangesController now separates review from execution. Save version prepares an immutable request snapshot: selected project-relative paths, status stateToken and the finalized subject/body/footer. ChangesTab displays that exact message and footer before Confirm and save version invokes git_commit. The snapshot is consumed once. Editing selection, title, notes or host context, cancelling, refreshing or receiving a watcher invalidation revokes it. Native stateToken validation still catches disk changes that happen after review; state-changed reloads status and requires a new review.

Ordinary manual Changes commits use explicit human origin. An app commit host can pass CommitContext through VersionsPanel/ChangesTab (or setCommitContext on its controller): origin, aiDrafted, substantive accepted-content evidence, optional sessionId and policy. These are host facts, not model-provided fields. Message drafting and content provenance are distinct. The footer policy/helper comes from integrator 6d30a18; this patch does not infer app origin from typed text. AI-task and CLI attribution remain separate routes and are not silently changed. History and Safety stay wired through the existing HistoryHost, HistoryController, recovery and refs adapters; successful commits remount history through onVersionSaved.

The four immutable-ref read wrappers and generate_handler registrations are restored from the surviving native modules. build.rs and capabilities/editor.json already declare all four and are retained. Generated command-name/error manifests now include the restored wrappers. The per-project watcher loop is restored with lazy runner generation invalidation, five-second registration retry and close cleanup. The legacy mutation implementation, identity, signing, hooks, subtree limits and restore-as-new-version behavior are unchanged. No remote commands or superseded read_open_bytes/OS-open handlers are restored.

## Checks

From phase1:

- npm run check:commands
- npm run typecheck
- npm run build (requires the existing WASM artifacts)
- npx tsx --test src/lib/git/history/*.test.ts src/lib/git/refs/*.test.ts src/lib/git/attribution/*.test.ts src/components/versions/*.test.tsx src/lib/gitReadFoundations.test.ts
- SOMNIA_CHROME=/path/to/chrome npx playwright test -c commit-review.playwright.config.ts
- SOMNIA_CHROME=/path/to/chrome npx playwright test -c git-harness.playwright.config.ts

The commit-flow E2E drives production ChangesTab and the production Tauri Git adapter with mocked IPC, verifies no early send, trailer stripping, edit revocation, exact outgoing paths/token/message and success. It is not a packaged native Git test. Light/dark pixels are checked at 320px panel width. Rust compilation and real notify/command behavior must be checked in CI and in packaged Windows/macOS/Linux builds; no local Rust compile was attempted for this package.
