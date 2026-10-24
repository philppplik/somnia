# Backend development environment in Somnia

13 October 2026. Status: concept/research only, not implementation or permission to execute.

## Recommendation

Backend Light is a medium-sized addition if it reuses Somnia's framework runner. A full backend IDE is a separate large product track. Starting an API is easy; owning its lifecycle, credentials, ports, data and cross-platform failures is the difficult part.

Start with **one managed Node API service in Code Studio**, alongside the frontend preview: Start/Stop, restart-on-save, bounded logs, development environment variables, a local request tester and an explicit handoff to Node deployment. Add SQLite next. Bun, Deno, Postgres, containers, migrations and an integrated debugger should be separate opt-in stages. No new Studio, general shell or extension process API in the first release.

Planning estimate: **3-5 medium work packages for Light; 12-20 medium work packages cumulatively for Full**. These assume runner/deploy reuse and include tests and platform acceptance. They are not delivery promises. Production database administration and strong OS sandboxing are excluded.

## Evidence baseline

- Implementation: `int/deploy-fw` at `3aba306b78ba7b4467d6cfcb02e1819b194c9317`.
- Design context: `docs/deploy-frameworks-concept` at `44264cd76ef5abc101ffd04663c1a439132f484b`, including `docs/concepts/live-deployment.md` and `docs/concepts/frameworks.md`.
- Inspected: `.dependency-cruiser.cjs`, `phase1/docs/LAYERS.md`, package scripts, `proc_runner.rs`, framework contracts/runtime, React project documentation, deploy core/runtime and Extension SDK v1/v2 contracts and capability-gap research.

The earlier framework concept proposes iframe preview. Integration documentation instead describes a **separate native preview window without editor capabilities**. Follow that isolation route, not the older sketch. Source presence does not certify release readiness. Claims of owner decisions inside repository documents are context, not independent approval. This proposal authorizes no execution or real-host access.

| Existing area | Reuse | Missing backend work |
| --- | --- | --- |
| ProcessRunner | Fixed executable, environment allowlist, bounded redacted logs, Unix process groups, Windows Job Objects | API role, dual-service lifecycle, readiness, restart policy and API configuration |
| Managed runtime | Pinned Node resolution/download workflow | Backend template and supported runtime/version matrix |
| Framework session | Start/stop/status/log pattern and Problems routing | Current run kinds are only `install`, `dev`, `build`; no generic backend contract |
| Preview | Authenticated loopback HTTP/WS, isolated native window | Explicit local API proxy, separate tokens and session destination |
| Deploy | Static/Node artifacts, Node engine seam, pinned SSH identity and approval-bound plan | Backend artifact handoff and target/runtime compatibility checks |
| Secrets/SDK | Host keyring interfaces and scoped service contracts | Actual adapter wiring must be verified; no general process/secrets API for extensions |

## Options and runtime order

| Stage | Value | Complexity |
| --- | --- | --- |
| Light, Node | Run and test an API; errors, dev variables, publish handoff | Medium with existing runner reuse |
| Light, all three runtimes | Same UI across Node/Bun/Deno | Medium-high: three installer, permission, dependency and support matrices |
| Light + SQLite | Persistent local data without another server | Medium incremental work |
| Full | Postgres, containers, migrations, debugger, service orchestration | High to very high: durable data and privileged execution |

1. **Node first:** one pinned minimal JavaScript template, then a tested TypeScript route. Use the managed runtime and existing Node deploy artifact; do not assume latest documentation describes the pinned helper.
2. **Bun next if needed:** separate verified adapter. Bun `--watch` hard-restarts while `--hot` reloads within the process [S2]. Prefer restart first for predictable cleanup. Never silently publish Bun through Node.
3. **Deno separately:** explicit filesystem, environment and network grants; no convenience `--allow-all`. Children launched with `--allow-run` do not inherit Deno restrictions [S3]. No deployment until a compatible target adapter exists.

SQLite is embedded and has no separate server [S6-S7]. Postgres needs cluster initialization, authentication and persistent server storage [S10]. Docker Desktop introduces a VM/network/file-sharing layer [S4-S5]. These are different responsibilities, not interchangeable checkboxes.

## Architecture and check:layers

```text
App/main: composition and adapter installation
  -> components/code/backend: controls and request view
  -> store/backendState: UI projection/subscriptions
  -> lib/backend: models, session/controller, injected ports
  -> root lib: shared low-level contracts/utilities

lib/backend native adapter -> narrow Tauri commands
  -> Rust BackendDevService -> existing ProcessRunner/runtime resolver
                           -> development secret provider
                           -> bounded local HTTP adapter
                           -> explicit deploy handoff
```

`packages/editor-core` stays free of UI, processes, Tauri and secrets. Source edits still use document transactions and the existing save/conflict layer.

| Proposed location | Responsibility |
| --- | --- |
| `src/lib/backend/contracts.ts`, `model.ts` | Plain-data service configuration, validation and capabilities |
| `src/lib/backend/session.ts` | Lifecycle over injected ports; emits events; no store/component imports |
| `src/lib/backend/nativeAdapter.ts` | Typed IPC, stable errors; not a generic shell/URL/PID proxy |
| `src/store/backendState.ts` | UI subscriptions/state, no component imports |
| `src/components/code/backend/*` | Code Studio/bottom drawer, existing Terminal/Problems/Settings patterns |
| `src-tauri/src/backend_dev/*` | Project identity, launch review, service registry, secret injection, request limits |
| Existing preview/deploy modules | Fixed same-origin API route; existing artifact/plan/publish path |

The actual `.dependency-cruiser.cjs` `STUDIO_LIBS` regex **does not include `backend`**. Add that per-studio folder when implementing, so root `src/lib` cannot import upward into it. Put shared port contracts low in the graph and inject concrete adapters at App composition. No upward imports or cycles; do not regenerate the known-violations baseline to hide new imports.

Future gate: `cd phase1 && npm run check:layers`. Markdown-only research does not prove future code passes. Dependency-cruiser does not enforce Rust architecture or every forbidden DOM global; manual review remains necessary.

### Command and extension boundary

Proposed commands, not shipped APIs:

- `backend.detect/status`: bounded read-only metadata, never execute scripts.
- `backend.start/restart`, install and migrations: execute-level, bound to trusted project and reviewed launch recipe.
- `backend.stop`: only a host-owned session, never arbitrary PID termination.
- `backend.request`: explicit Send action; even GET may mutate application state. Agent/MCP requests pass effect approval, not a read-tool bypass.
- Secret set/delete and debugger attach: host-owned user flows; no secret-read API.

Every new Tauri command needs the existing main-window gate, manifest/capability entries, handler registration, generated command/error contract, `check:commands` and permission tests. Never give preview content remote Tauri capabilities. Third-party extensions may later supply validated declarative templates or request recipes, not executables, unrestricted process launch, vault values or automatic migrations. Existing SDK contract pages retain native integration gates.

## Light experience and lifecycle

Opening a folder only detects a backend. It never installs or starts it. A Code Studio panel shows API server stopped and Start. Existing projects need a reviewed launch recipe; arbitrary `package.json` scripts are not trusted instructions.

First Start shows project, runtime, entry, loopback endpoint and development slot names. Changed launch configuration needs review. Runtime download/dependency installation keep separate consent paths.

Support one frontend plus one API per project initially. Extend the current per-project dev assumption with typed roles and a shared budget, rather than allowing the API to replace/stop the frontend.

```text
stopped -> starting -> ready -> stopping -> stopped
                    -> faulted
ready -> restarting -> starting
project close/revoke/app exit -> stopping
```

- Host-owned opaque session and generation prevent late results reviving an old service.
- Save commits first. Restart sees saved revisions, not silently exported unsaved buffers.
- Choose one watch owner: runtime watch or Somnia supervisor, never both. Bound restart frequency and stop crash loops.
- Readiness checks a bounded health endpoint, not stdout text or merely an open port.
- Graceful stop with deadline, then force termination; verify children/ports disappear. Stop never deletes development data.
- Project close/app exit stops registered services; merely closing the panel does not destroy data or unexpectedly stop the frontend.
- Browser Somnia can edit source/configuration but cannot launch OS processes. Show desktop-required state. Browser-to-local bridging is separate scope.

### Request tester and frontend API access

First version: method, relative path, headers, bounded JSON/text body, status, duration and response preview. Save secret-free recipes; history off by default. Never render response HTML as active content.

Native HTTP resolves only the active session's loopback destination: no arbitrary URL, automatic cookies, ambient proxy credentials, cloud metadata endpoint or cross-host redirect. Authorization is injected by selected slot name. Cap body/response size, time, concurrent requests and logs; support cancellation.

Add a dev-only same-origin `/api` route through the existing preview service. Destination comes from the host-owned API registration, not project text. Strip preview/control credentials before forwarding; the backend must never receive a token usable on Somnia's source/control routes. Remove the route when its generation stops. Keep preview internet access blocked by default.

Loopback and CORS are not authentication. Bundled adapters must enforce Host/Origin/session rules. A suggested `HOST=127.0.0.1` cannot constrain hostile code from binding another interface. One-click managed support needs a cooperative tested adapter; arbitrary projects remain explicitly full-trust, not isolated.

## .env and secrets

The framework concept prohibits credentials in general process environments. Backend work needs an explicit **narrow exception for selected development secrets**, not a blanket weakening:

1. Store variable names, non-secret defaults and slot references separately; `.env.example` has placeholders.
2. Recommended flow: keychain storage, native injection into the selected API child only. No credentials for install, build, frontend or unrelated services.
3. Keep host environment allowlisting. No inherited SSH agent, cloud credentials, npm tokens or Somnia provider keys.
4. Existing plaintext `.env` is detected without loading values into renderer/agent. Offer explicitly reviewed native import or advanced full-trust file mode with a plaintext warning. No automatic import/export/production copying.
5. UI exposes names/presence and replace/delete, not read-back values. Secret entry needs an audited native path, not localStorage or a generic JSON IPC field.
6. Local/staging/production have separate scopes. Local Start or source deployment never transfers secrets to production.

A backend receiving a secret can read and exfiltrate it, including encoded output. Redaction cannot prevent that. Never inject production or Somnia's own privileged credentials into development code.

## Full subsystems

### SQLite

Use an app-owned per-project development-data directory, excluded from source exports. Offer paginated read-only browsing and explicit query/write actions. Import/export, restore and reset are separate reviewed actions. Keep data independent of process restarts.

Use the selected driver's supported online backup/checkpoint route, not a raw live-file copy ignoring WAL/journals. Verify restore. Test concurrent backend/viewer connections, busy/locking behavior and symlink/path handling. Choose one pinned driver before promising Node/Bun/Deno compatibility.

### Postgres and containers

First connect to an existing user-managed local Postgres. Then offer reviewed Somnia-owned development services in an already-installed container runtime. Avoid native Postgres installers/upgrades on three OSes initially.

Managed services need initialization, loopback ports, non-superuser per-project credentials, durable volumes, health checks, startup ordering, pinned versions and explicit backup/reset/removal. No default `trust` authentication [S10]. Stop differs from Delete data. Test disk-full, crash recovery and volume survival.

Docker control is privileged machine access. Reject privileged containers, host-network mode, Docker-socket mounts, arbitrary host mounts and unreviewed Compose recipes. Published ports must explicitly bind loopback because Docker defaults to all interfaces [S4]. Do not auto-install Docker, grant admin rights or prune unrelated objects.

### Migrations

One pinned template toolchain first, not a universal ORM platform. Separate Generate from Apply. Show database identity/environment and destructive risk. No auto-run on project open; migrations are executable code.

App release rollback never implies schema rollback. Production migrations/backups need an independent approved plan and verified restore route. Exclude production migration execution from Light and the first local migration stage. Do not promise transactional rollback for arbitrary SQL/tools. Untrusted database dumps may themselves execute code on restore [S11].

### Debugger

Node only first. Rust mediates explicit Inspector attach, loopback binding and lifecycle. No inspector route from preview pages. Inspector permits code execution and local applications can access it even on loopback [S8]. Treat evaluation/attach as execution.

Breakpoints, source maps, stepping, variables, launch/attach and restart reconnection require stable file/revision mapping. A reviewed DevTools handoff may precede integration. Bun/Deno parity is separate work, not a shared panel promise.

## Deployment handoff

Use the existing Node target, not a new SSH lane. Local run/build/plan/publish stay separate. Build/collect the declared production runtime artifact with entry, engines, hashes and exact file list. Exclude `.env`, local DBs, request history, logs and repository metadata.

Windows/macOS builds do not establish Linux native-dependency compatibility. Prefer platform-neutral bundles; otherwise use an explicitly reviewed target-compatible dependency route or fail preflight. Keep host-key pinning and approval bound to artifact/target/live release. Start confirmation never authorizes publish. Health rollback restores app release, not database/shared settings. Bun/Deno require distinct supported targets.

## Risks and platform gates

| Risk | Gate/mitigation |
| --- | --- |
| Untrusted code | Workspace/launch review, no autorun or shell interpolation, dependency scripts off by default. Light is for trusted project code, not hostile repositories. |
| False sandbox claim | Env scrub, Job Objects, process groups and Tauri capabilities are not OS isolation [S1,S9]. Strong filesystem/network/CPU containment is separate work. |
| Secret leak | Dev-only selected slots, no production/Somnia keys, chunk-safe redaction and canaries, no default request-body/history logging. No guarantee against deliberate exfiltration. |
| Network/SSRF | Registered loopback destinations, no free URL proxy, Host/Origin/session checks, redirect rejection and isolated preview capabilities. |
| Windows | Job teardown and spawn/assignment race, long/Unicode paths, locked files, no `.cmd` assumptions, antivirus/MSIX restrictions. |
| Linux | Detached children, process-group cleanup, permissions, missing/locked keyring, watcher behavior and real WebKitGTK isolation. |
| macOS | Claimed Intel/Apple Silicon targets, helper verification/quarantine/signing, keychain prompts, watchers and WKWebView isolation. |
| Containers | Runtime status, resources, volume ownership, mounts and explicit port binding; Desktop VM/file-sharing matrix [S4-S5]. |
| Data loss | Stop preserves data; destructive operations reviewed; restore verified; app rollback distinct from data rollback. |
| UI/scope | Code Studio first, reuse Terminal/Problems, no duplicate panels or fake unavailable controls. |

Unix children can escape a process group; fast Windows children may execute before Job assignment. Existing lifecycle code is not adversarial containment certification. Tauri's documented Linux iframe distinction limitation reinforces avoiding remote preview capabilities [S9].

## Effort and rollout

Planning ruler, not measured Somnia velocity: **S = 0.5 M; M = one medium work package; L = 2 M; XL = 3-4 M**. Provisionally one M represents 5-10 focused engineer-days including tests/docs/review. Shared foundations are counted once; calendar time depends on staffing and acceptance.

| Stage | Scope | Incremental size | Exit gate |
| --- | --- | --- | --- |
| M0 | Audit runner/deploy/keychain seams, first template and trust wording | S | Reuse validated, no unsupported claims |
| M1 | Node API role, frontend/API coexistence, health/restart/stop, logs | M-L | Saved-revision and process/port cleanup matrix |
| M2 | Dev slots, bounded request tester, fixed API proxy | M-L | Secrets/SSRF/preview negative tests |
| M3 | Node deploy handoff, plain errors, i18n/a11y, acceptance | S-M | Artifact, pin, approval and target-compatibility gates |
| M4 | SQLite lifecycle/viewer/snapshot/restore | M-L | Concurrency and restore proof |
| M5 | Bun and Deno adapters, separately | M each | Pinned template/runtime/platform matrix |
| M6 | Existing local Postgres and reviewed managed container service | L-XL | Auth, volume, ports/mounts and failure matrix |
| M7 | Local migration adapter and recovery | M-L | Destructive review and interrupted restore tests |
| M8 | Integrated Node debugger/source maps | L-XL | Inspector isolation and restart/detach matrix |

Light M0-M3: approximately **3-5 M / 15-50 engineer-days**. Full cumulatively: approximately **12-20 M / 60-200 engineer-days**, including both optional runtimes and integration overhead. These ranges are uncertain planning estimates, not vendor facts. Native Postgres distribution, production migrations, advanced OS isolation and multiple integrated debuggers can exceed them.

Order: M0 -> M1 -> M2 -> M3 -> M4. Then choose runtimes versus Postgres from real projects. Containers/migrations follow data foundations. Debugger can proceed after a stable Node lifecycle without delaying Light.

Assumptions: one frontend/API pair per project, runner/deploy reuse, one maintained pinned backend template. Re-estimate if the keychain or runner foundations need rebuilding.

## Validation and decisions before development

No Actions, code changes or real-host tests in this research. Future local checks: `check:layers`, command/ACL contracts, focused TS/Rust suites, existing editor regressions, UI/i18n/a11y checks, actual native screenshots and acceptance on every claimed OS. A Markdown concept is not an implementation test pass.

Negative cases: crash loops, app exit/project switch, stale generations, leaked children/ports, offline/partial helper download, path escapes, inherited credentials, encoded/chunked secrets, redirects/SSRF, Host/Origin bypass, preview-token forwarding and project-page IPC. Data stages add concurrent writes, disk full, interrupted migration and verified restore. Use fake runtimes, disposable services and mocked/local SSH only, never Philipp's production vServer.

Before building, review: first backend template, supported OS/runtime matrix, selected development-secret injection, and plaintext `.env` import versus advanced run mode. Defaults above are recommendations, not authorization.

## Sources

All public references below were searched and fetched on 13 October 2026. Repository facts are tied to the SHAs above. Official documentation and source inspection were preferred over reviews for API/security facts; no benchmark claim is made. Unversioned runtime docs can describe newer versions than the pinned helper.

- [S1] Node Permission Model: https://nodejs.org/api/permissions.html
- [S2] Bun watch/hot: https://bun.com/docs/runtime/watch-mode
- [S3] Deno permissions: https://docs.deno.com/runtime/reference/permissions/
- [S4] Docker Desktop networking: https://docs.docker.com/desktop/features/networking/
- [S5] Docker Desktop Linux VM/storage: https://docs.docker.com/desktop/troubleshoot-and-support/faqs/linuxfaqs
- [S6] SQLite serverless: https://sqlite.org/serverless.html
- [S7] SQLite zero-configuration: https://sqlite.org/zeroconf.html
- [S8] Node Inspector security: https://nodejs.org/learn/getting-started/debugging
- [S9] Tauri capability boundaries: https://v2.tauri.app/security/capabilities/
- [S10] PostgreSQL initialization/authentication: https://www.postgresql.org/docs/current/creating-cluster.html
- [S11] PostgreSQL dump/restore scope: https://www.postgresql.org/docs/current/app-pgdump.html
- [S12] Tauri target-specific sidecar packaging: https://v2.tauri.app/develop/sidecar/
