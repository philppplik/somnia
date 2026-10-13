# Frameworks: React, Vue, Svelte, Solid, Astro and Next in Somnia

Status: proposed concept and design. Not implemented. Needs Philipp's OK on concept and design before any dev work.
Baseline: `int/alpha6` (`622669d`, v12.2.0-alpha.7). Grounded in the code paths listed under "Current state".

## 1. Goal

Today Somnia edits plain HTML, CSS and JS sites. Most new web projects start in a framework. Philipp wants Somnia to start, preview, edit and publish those projects too, without a terminal and without knowing what Node, Vite or SSR mean.

The experience we want, in one line: **New Project, pick "Interactive app (React)", click Create. The preview is running a few seconds later. Publish is one button.**

Order of work: React first, then Vue, Svelte, Solid, then Astro, then Next. Others follow the same pattern.

## 2. Current state (what the repo does today)

| Area | Where | Today |
| --- | --- | --- |
| Project types | `phase1/src`, `docs/dreamweaver-parity.md` | Static HTML/CSS/JS folders. No framework template, no scaffold, no "New project from template". `SaveDialog.tsx` only creates a folder. |
| Starter content | `lib/starterKit.ts` | Plain HTML component blocks (nav, hero, card, pricing, footer, forms), no framework code. |
| Live preview | `docs/live-preview-architecture.md`, `previewResources.ts`, `livePreview.ts`, `previewModules.ts` | Inlines every file into one sandboxed iframe. `sandbox="allow-scripts"`, CSP `default-src 'none'`, `connect-src 'none'`, no network. Relative ES modules become `data:` URLs. Bare specifiers (`import React from 'react'`) are **not resolved**. Import maps and computed `import()` are not supported. Limits: 300 files, 40 MB per build. |
| Preview as static only | same doc, "Limits" | "Static site only: no server". |
| Build tooling | `phase1/package.json` | Somnia's own app uses Vite 8, React 19, TypeScript. That toolchain builds Somnia itself. It is not exposed to user projects, and user machines have no guaranteed Node. |
| Commands | `lib/commandSpec.ts`, `commandDispatcher.ts`, `agent/commandTools.ts` | `CommandSpec` has a `level`. `ui` level runs from interactive origins only (agent and MCP excluded). An `execute` tool exists for agents and re-checks the level at call time. |
| Secrets | `src-tauri/src/oauth_store.rs`, `keyring` dependency in `Cargo.toml` | OS keychain through `keyring`. Tokens never reach the renderer. This is the existing vault path. |
| Extensions | `lib/extensions/contributions.ts`, `docs/extensions/*` | Contribution families: `commands`, `panels`, `themes`, `snippets`. Panels are isolated webviews. No process or network brokering yet (`docs/extensions/research/sdk-capability-gaps-2026-10-09.md`, P2). |
| Deployment | `docs/vibespace/policy.md`, `docs/SYNC-FOLDER.md` | No deploy feature in the repo. `policy.md` says anything tagged send, purchase, credential or payment is always-ask for agents. This doc assumes the live-deployment concept is "build locally, upload files to the user's own host over SSH/SFTP, confirm first". See section 7 and open question 1. |

What this means: the current preview pipeline cannot run any framework project. A React app imports `react` from `node_modules`, uses JSX, and often needs a dev server. Extending the inlining resolver to cover that would re-implement a bundler. We should not.

## 3. Decisions

### 3.1 Vite-based templates first, meta-frameworks second

| Option | What it is | Verdict |
| --- | --- | --- |
| A. Vite templates (React, Vue, Svelte, Solid, Preact, vanilla TS) | Client-side single page app, `vite build` makes a static `dist/` | **Phase 1.** Small, fast, one build tool, output is static files. |
| B. Meta-frameworks in static mode (Astro default, Next with `output: 'export'`, SvelteKit with `adapter-static`, Nuxt `generate`) | File-based routing, build makes static HTML per route | **Phase 2.** Same artifact as A. Gives routing and content sites. |
| C. Meta-frameworks with a server (Next server, Astro SSR, SvelteKit node adapter) | Needs a running Node process in production | **Phase 3, opt-in.** Changes the deploy story (3.4). Not needed for the first release. |

Rule: **a template is "one-click" only if its output is a folder of static files.** Anything that needs a server is labelled "Needs a Node host" in the gallery and starts disabled until the deploy side supports it.

Astro goes before Next on purpose: Astro's default output is static, it fits Somnia's "content and media people" audience, and it can embed React, Vue, Svelte and Solid components. Next in static-export mode works but drops its main features (server components with data, image optimiser, middleware). It ships after Astro, with those limits shown in plain words in the gallery.

### 3.2 Build runner: managed Node, downloaded once, never bundled

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Bundle Node in the installer | Works offline from the first start | +35-60 MB per platform, Store (MSIX) size and review, we own security updates | No |
| Use the user's Node | Zero download | Layperson often has none, versions differ, "works on my machine" | Fallback only, never required |
| **Somnia-managed Node**, pinned LTS, downloaded on first framework use into the app data folder, SHA-256 verified against a hash pinned in the app | Same version for everyone, no PATH problems, small installer, replaceable per release | Needs network once | **Chosen** |
| In-browser runtime (WebContainer style) | No local process | Third-party licence and service dependence, breaks local-first | No |
| Rust-native bundler (Rolldown, SWC, esbuild as binaries) | No Node | Cannot run framework plugins (Svelte, Vue SFC, Astro), too narrow | Not now |

Details:

- First use shows one dialog in plain words: "Frameworks need a small helper program (about 40 MB). Download it once?" with one button. After that, never again.
- Runtime lives under the app data folder, not in the project. It is removed from Settings > Frameworks > "Remove helper".
- Package manager: npm that ships with the pinned Node. pnpm and bun later, only on request.
- Install runs with `--ignore-scripts` by default and with the lockfile from the template. A short allowlist of known install scripts (for example native-binary downloaders of esbuild-like tools) runs only for packages the template ships. A user who adds a package with an install script gets a notice, not a silent run.
- Every process (install, dev server, build) is spawned by Rust with: cwd inside the project, scrubbed environment (no `SOMNIA_*`, no tokens, no SSH variables, no proxy credentials), stdout and stderr capped and secret-redacted, a timeout, and a kill on project close or app quit.
- Build output and logs go to the Problems and Terminal panels, not the main UI (Philipp's rule: no debug text in the main screen).
- Windows first. Philipp tests on Windows, so the runner must work with spaces and long paths, and must not assume a shell.

### 3.3 Live preview: dev server on loopback, not the inlining pipeline

The existing preview stays as is for static sites. Framework projects use a second preview mode.

```
Somnia (Tauri)                       Managed Node (child process)
  Preview iframe  <-- http://127.0.0.1:<port> -->  Vite / Astro dev server
  Problems panel  <-- stdout/stderr (redacted) ---  build errors, warnings
```

Rules:

- Bind to `127.0.0.1` only, random free port, chosen by Rust, not by the template. `server.host` and `allowedHosts` locked to loopback so other machines and DNS rebinding cannot reach it.
- The iframe keeps `sandbox="allow-scripts allow-same-origin"` **only** in this mode. `allow-same-origin` is needed for ES modules and HMR from the dev origin. It is safe here because the iframe origin (`127.0.0.1:<port>`) is different from the app origin, so the page cannot touch Somnia. No `allow-top-navigation`, `allow-popups`, `allow-forms`, `allow-modals`.
- The Somnia window CSP gets one narrow addition: `frame-src http://127.0.0.1:<port>`, set when a preview starts and removed when it stops. No wildcard port.
- The framed page's own CSP comes from a response header added by a small Somnia Vite plugin: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (frameworks inject styles), `connect-src 'self' ws://127.0.0.1:<port>` for HMR, `img-src 'self' data: blob:`, `font-src 'self' data:`, `frame-ancestors` limited to the Somnia origin. Outbound network from the previewed app stays blocked in the default profile, like today. A per-project toggle "Allow this app to call the internet" is a later, explicit setting.
- ES modules are real here (served by Vite), so none of the data-URL, cycle and bare-specifier limits apply.
- Click-to-source: the Somnia Vite plugin adds a dev-only `data-somnia-src="file:line"` attribute so a click in the preview jumps to the code, as in the HTML preview today. Visual canvas editing (two-way sync) stays **HTML only**. For framework projects Somnia is honest: preview plus code, inspector read-only. This is stated in the gallery card.
- Limits: one dev server per project, max 2 running at once, idle stop after 10 minutes with the preview closed, build timeout 5 minutes, install timeout 10 minutes, log buffer 5 MB, `node_modules` excluded from indexing, Smart Open, search, agent reads and the file watcher (Vite watches it itself).
- Fallback: if the managed runtime is missing or fails, a framework project still opens in the code editor. The preview shows one clear message and a "Fix" button, never a blank frame.

### 3.4 Deploy artifact: static by default, Node server in the first release

| Artifact | From | Upload | Host needs | Phase |
| --- | --- | --- | --- | --- |
| **Static folder** (`dist/`, `build/`) | Vite templates, Astro static, Next export, SvelteKit static | Files over SFTP or rsync into the web root | Any web server | 1 and 2 |
| **Node bundle** (`.output/`, `build/` plus `package.json`, start script) | Next, Astro SSR, SvelteKit node | Files, plus restart of a service | Node installed, process manager, reverse proxy | 3 |

How it fits the live-deployment concept:

- The deploy step never builds on the remote host. It builds locally with the managed runtime, then uploads a **file list with hashes** (the artifact manifest). The remote listing is compared to the manifest. The confirmation dialog shows what will be added, changed and removed.
- Static is the same as what a plain HTML project deploys today, so Phase 1 adds **no new deploy code path**, only a "build first" step in front of it.
- SPA routing: for Vite single-page templates the artifact includes a generated server-rule snippet (for nginx `try_files ... /index.html`, for Apache `.htaccess`) shown to the user, never written to the host without the confirmation dialog listing it.
- Node bundles need a service restart on the host (systemd user service, health check, automatic rollback). Philipp decided on 2026-10-13 that SSR and Node apps are part of the first release. The deploy side is specified in live-deployment.md sections 6.2 and 13 step 7. The extra risk review happens inside milestone M4 below.

### 3.5 Security constraints (binding for all milestones)

- Secrets, SSH keys, passphrases and tokens live **only** in the OS keychain through the existing `keyring`/vault path. They never appear in logs, error messages, project files, `exportState`, build env, the dev server env or the artifact manifest. Redaction runs on every captured process line and on every error that crosses into the renderer.
- Deploy is an `execute` level `CommandSpec` (`deploy.publish`, see live-deployment.md section 11). It requires the confirmation dialog every time with: target (user, host, path), **host-key fingerprint** (first use: shown for trust-on-first-use, afterwards compared and a mismatch hard-stops), and the file list or diff. It is **never UI-free for agents**: an agent may prepare (`deploy.plan` read level, produces the diff) but cannot confirm. Matches `docs/vibespace/policy.md` always-ask.
- Install, build and dev-server start are also `execute` level, because they run third-party code. A user clicking in the UI is the confirmation. Agent and MCP origins need the existing execute-tool gate.
- Philipp's vServer is **never touched** by tests, spikes or demos. Deploy tests run against a container SSH server or a mock only (section 8).
- Project files never store host passwords. The project may store a non-secret deploy profile (host name, user, path, host-key fingerprint). The key or password is a keychain item referenced by name.

## 4. Template and scaffold UX

Principle: one choice, one click, no jargon. Words in the UI: "Website", "App", "Helper program", "Publish". Not: Node, npm, Vite, SSR, bundler, adapter.

### 4.1 Flow

```
File > New Project
  +------------------------------------------------------------+
  | What do you want to make?                                  |
  |  [ Simple page ]  [ Interactive app ]  [ Content site ]    |
  |   HTML, CSS        React, Vue, Svelte,   Astro, blog,      |
  |                    Solid                 docs              |
  |                                                            |
  |  Interactive app -> Framework:  (React) Vue Svelte Solid   |
  |                     Language:   JavaScript  TypeScript     |
  |  Name: [ my-app ]   Folder: Documents\Somnia\my-app  [..]  |
  |                                        [ Create ]          |
  +------------------------------------------------------------+
```

1. Pick a card, optionally a framework chip. Defaults: React, TypeScript. Name and folder are prefilled and editable.
2. **Create** copies a bundled template (no network, no `create-vite` at run time), then, if the helper is missing, asks once to download it, then installs packages and starts the preview. One status line shows "Setting up... Installing... Starting preview". Details go to the Terminal panel.
3. The preview opens, the Code studio opens `src/App.*`. A one-line banner: "Edit the text in App and save. The preview updates."
4. Failures show one sentence and one button ("Try again", "Open log"). Never a stack trace in the main UI.
5. **Publish** in the header (same place as for plain sites): build, then the confirmation dialog from 3.5.

### 4.2 Detecting existing projects

Opening a folder with `package.json` and a known framework dependency shows a non-blocking pill "React app detected - Run preview". Detection is read-only and never runs code. Unknown setups open as plain code with no pill.

### 4.3 Template contents

- Pinned dependency versions and a committed lockfile per template, refreshed per Somnia release.
- Accessible by default (landmarks, `lang`, focus styles), in line with the starter kit rules in `starterKit.ts`.
- A small `somnia.template.json` (id, framework, language, output kind `static|node`, run scripts, deploy artifact path). Somnia reads this, not the project's `package.json`, to decide what to run, so a hostile `package.json` script name cannot widen what the one-click buttons execute. Scripts run are exactly `dev`, `build` as declared there, mapped to fixed argument lists.
- Names and i18n: gallery strings in en, de, es, fr, pt-BR like the rest of the UI.

### 4.4 Agent angle

The Somnia Agent can propose `project.scaffold` (write level, creates files in a new folder only) and `project.plan`. Install, run and deploy stay `execute` level with the user's confirmation. The agent reads framework projects through the normal file tools, minus `node_modules` and build output.

## 5. Extension SDK angle

Frameworks are the first real test of "templates as data".

- New contribution family `templates` in `contributions.ts`, next to `commands`, `panels`, `themes`, `snippets`. A template contribution is **data only**: a file tree with variables, the same `somnia.template.json` fields, and gallery metadata (name, icon, description in plain words).
- No code runs at scaffold time. A template can only request fixed post steps from an allowlist (`install`, `build`, `dev`), each still `execute` level with the user's click.
- Extensions cannot spawn processes or reach the network in round 1 (SDK gap P2 stays). A framework pack like "Angular" or "Qwik" is therefore a template pack plus an optional pinned runtime requirement the host already knows how to fetch. A pack that needs a different Node version is rejected until the runner supports it.
- Store rules apply: verified publishers, restricted mode for unverified packs (unverified templates can be previewed as file lists, not scaffolded), and the install consent screen lists "Adds project templates" as a capability.
- Built-in templates use the same format, so the first-party gallery is the reference implementation and test fixture for the SDK.
- Also exposed to extensions later: a read-only "project kind" query so a panel can show framework-specific help.

## 6. Components and new native commands

| Component | Status | Responsibility |
| --- | --- | --- |
| `lib/frameworks/templates/*` | new | Bundled template file trees and lockfiles, `somnia.template.json` |
| `lib/frameworks/scaffold.ts` | new | Pure: file map, variable substitution, path-escape checks |
| `lib/frameworks/detect.ts` | new | Pure: classify a folder from file names and `package.json` |
| `components/NewProjectDialog.tsx` | new | Gallery from 4.1 |
| `lib/frameworks/runner.ts` | new | Frontend side of the runner: start, stop, status, log stream |
| `src-tauri/src/runtime.rs` | new | Download, verify and locate the managed Node |
| `src-tauri/src/proc_runner.rs` | new | Spawn, env scrub, redaction, caps, timeouts, kill on close |
| `components/Preview` | extend | Second mode: loopback iframe from 3.3 |
| `lib/extensions/contributions.ts` | extend | `templates` family |
| Somnia Vite plugin (shipped in templates) | new | Loopback CSP header, click-to-source attribute, dev only |

New Tauri commands (names are proposals): `runtime_status`, `runtime_install`, `project_run`, `project_stop`, `project_logs`. **Each new command needs the full checklist**: `build.rs` entry, `capabilities/editor.json` permission, registration in the `invoke_handler` in `desktop.rs`, `scripts/errors/gen-commands.mjs` regeneration, `npm run check:commands` green, and `tauriPermissions.test.ts` updated. A command added without all six is not done.

## 7. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| npm supply chain (malicious or typosquatted package) | Code runs on the user's machine | Locked templates, `--ignore-scripts`, scrubbed env, no secrets in the process environment, notice when the user adds a package, execute-level gate |
| Dev server reachable from the network or via DNS rebinding | Source leak | Loopback only, `allowedHosts` locked, random port, per-run token header checked by the plugin |
| `allow-same-origin` iframe weakens the sandbox | Preview page reads Somnia | Different origin by construction, no top navigation, test that the frame cannot read `window.parent` |
| Secret leaks through process logs or errors | Credential exposure | Env scrub, redaction on every line and error, test with canary secrets in the keychain mock |
| Deploy overwrites or deletes remote files | Data loss on the host | Diff in the dialog, deletes listed separately and off by default, no delete of paths outside the deploy root |
| Wrong or changed host key | Man-in-the-middle upload | Fingerprint shown and pinned, mismatch is a hard stop |
| Large `node_modules` slows file tree, search, agents | Lag, crashes (a known Dreamweaver pain) | Excluded everywhere, lazy tree node, size shown in Settings with "Clean" |
| Helper download blocked (offline, proxy, antivirus) | No preview | Clear message, code editing still works, manual "use my own Node" fallback |
| Framework versions drift | Templates break | Version pins per release, template matrix verification (section 8) |
| Scope: six frameworks at once | Late delivery | React alone ships M1 to M3. Others are data added to a proven pipeline |
| Promise of visual editing for frameworks | Disappointed user | Gallery and docs say "preview and code", canvas editing is HTML only |

## 8. Test strategy

No GitHub Actions. Everything runs locally and in the swarm's own gates.

- **Unit (vitest):** `scaffold.ts` (substitution, path escape, overwrite refusal), `detect.ts` (fixtures for each framework, hostile `package.json`), template manifest schema, extension `templates` contribution validation, redaction function with canary secrets, CSP string builder (exact policy per mode, no wildcard port).
- **Rust (`cargo test`):** `runtime.rs` hash verification (good, bad, truncated download), `proc_runner.rs` with a fake "node" executable: env scrub, output caps, timeout kill, kill on close, redaction. Path tests with spaces and long paths on Windows.
- **Tauri command gate:** `check:commands` and `tauriPermissions.test.ts` for each new command.
- **Template matrix script** `scripts/verify-templates.mjs`, run locally before a release: for each template scaffold, install from the offline cache, `build`, assert `dist/index.html` exists, assert no references to external hosts, assert file count and size budget, run axe on the built page. Output is a JSON report next to `PERF-LARGE-PROJECTS-results.json` style files.
- **Playwright (`phase1/tests`):** New Project gallery, create with a mocked runner, preview mode switch, failure message, Problems panel content, i18n parity, a11y spec for the dialog. One real-runner spec behind an env flag for local use.
- **Sandbox tests:** frame cannot read parent, cannot navigate top, blocked external fetch is reported, HMR websocket connects only to the allowed port.
- **Deploy tests:** against a container OpenSSH server or an in-process mock SSH/SFTP server only. Cases: first-use fingerprint prompt, fingerprint mismatch hard stop, diff correctness (add, change, delete), agent origin cannot confirm, credential never in logs or in `exportState`. A guard test fails if a deploy target resolves to anything but `localhost`, a container name or the mock in the test environment. Philipp's vServer is never a target.
- **Manual by Philipp (Windows):** first-run helper download, create React app, edit and save, preview updates, close with unsaved changes warns, publish dialog reads clearly. A version becomes stable only after this.

## 9. Milestones (prioritised, SSR pulled forward)

| M | Scope | Result for Philipp | Depends on |
| --- | --- | --- | --- |
| M1 | Managed runtime download and verify, `proc_runner` with env scrub and redaction, commands + checklist, Settings > Frameworks (status, remove) | Nothing visible except the helper in Settings | None |
| M2 | **React (Vite, TS and JS) template**, scaffold, New Project gallery with one framework card, dev server on loopback, preview mode 2, Problems panel output | "New Project, React, Create" shows a running app | M1 |
| M3 | Build step and static artifact manifest, "Publish" builds first, uses the static deploy path with the 3.5 dialog | One-click publish of a React app | M2, deploy concept steps 1 to 4 |
| M4 | **Node/SSR artifact and server-app templates**: Node bundle artifact, `engines` check, service restart and health check through the deploy concept step 7, SSR templates (Next standalone, Astro Node adapter, SvelteKit node) | SSR apps publish with one click, with a clear "needs Node on the server" notice | M3, deploy concept step 7 |
| M5 | Vue, Svelte, Solid, Preact, vanilla TS templates (data only), detect existing projects pill | Framework chips in the gallery | M2 (parallel with M3 and M4) |
| M6 | Astro (static and content site) with component islands | Blog and docs starter | M5 |
| M7 | Next (static export and standalone), SvelteKit static, Nuxt generate and node-server | More meta-frameworks | M4, M6 |
| M8 | Extension SDK `templates` family, built-in gallery moved to it, restricted-mode rules | Extensions can add templates | M5, SDK work |

Gates per milestone: `tsc`, `vitest`, `cargo test`, `check:commands`, i18n parity, Playwright baselines for the existing Code and Live View studios unchanged.

## 10. Decisions (Philipp, 2026-10-13)

1. Live deployment follows `live-deployment.md` (build on this PC, upload over SSH to the user's own server, automatic SSL).
2. Node and SSR apps are in the first release, not later.
3. The managed Node helper download (about 40 MB, once, on first framework use) is accepted.
4. Framework order follows the Vite order: React, then Vue, Svelte, Solid, then Astro, then Next.
5. Defaults stand for the rest: Debian and Ubuntu servers, confirmation on every publish, 5 kept releases. Open for review during development: gallery wording, visual-editing scope, internet access of the previewed app (blocked by default).

## 11. Out of scope

No code in this change. No changes to Smart Open routing, studio shell, the HTML canvas editor, the existing static preview pipeline or Vibe Space. No GitHub Actions. No deploy to any real host while building or testing. No bundled Node. No in-browser runtime.
