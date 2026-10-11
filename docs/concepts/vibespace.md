# Vibe Space - concept for Somnia 12.2.0 ("Vibe Studio")

Status: All decisions D1-D12 made and locked by Philipp, incl. Linux tier plan (2026-10-11). Skills library (4.4) added and its decisions locked 2026-10-11. 
Target path when approved: `docs/concepts/vibespace.md`
Basis: Phase 1 decisions plus 20 Phase 2 research reports (snapshot 2026-10-10).
Naming (fixed with Philipp): **Vibe Space** = the container. **Studios** = sessions inside it.

## 1. Product picture

A Vibe Space is a persistent, local-first workspace for working with AI agents across Somnia's studios (Code, Documents, Sheets, Slides, Design, Vector, Photos, ...). The user states an outcome. One or more agents do the work in isolated runs. Nothing lands in the real project until the user reviews and applies it.

Principles:
1. **Local-first.** State, memory, schedules and run history live on the user's machine (SQLite + files). No Somnia cloud needed. BYOK or local models.
2. **Nothing lands unreviewed.** Agent work happens in an isolated copy. The user applies it explicitly (Replit "Ready" -> apply model).
3. **No silent failures.** Every failed, crashed or coalesced run is visible (Problems panel + return card).
4. **One consent broker.** Every effect (file write, shell, network, extension activation, MCP tool call) goes through one Rust policy gate. Higher autonomy levels never bypass the hard boundaries.
5. **Thin own orchestration.** Rust core owns the loop, scheduling, consent and persistence. We adopt SDKs and patterns, not heavy frameworks.
6. **Honest platform limits.** Where Windows or Wayland are weaker, the UI says so.

## 2. Vocabulary

| Term | Meaning |
|---|---|
| Vibe Space | Container: memory, skills, rules, schedules, runs, checkpoints, autonomy settings for one project or one personal scope |
| Studio (session) | One agent session inside a Vibe Space: a goal, a model, a toolset, an isolated working copy, a transcript |
| Run | One execution of a studio, manual or scheduled. Has state, cost, checkpoints, result |
| Schedule | Cron rule that creates runs of a studio |
| Checkpoint | Content-addressed snapshot taken before agent edits, restorable |
| Consent broker | Rust policy gate for all effects |

Naming is RESOLVED (D8): sessions are called "Studio" in the UI, the main container is labelled "Vibe Space". No rename, no clash.

## 3. Core flows

### 3.1 Start a studio
1. User opens a Vibe Space (rail icon, same slot pattern as the existing Agent panel). Empty state offers 3 templates, not a blank page.
2. "New studio": goal text, pick model (local / BYOK), pick scope (which folder/documents), autonomy level, optional schedule.
3. Core creates an isolated working copy (git worktree for code, content-addressed snapshot for other formats), takes checkpoint 0, starts the agent loop.
4. The studio card shows: state, last step (one line, not the full log), model badge, cost and time so far.

### 3.2 Stop / pause / steer
- Stop: cooperative cancel, then hard kill of the sandboxed process tree. Partial work stays in the isolated copy, state = stopped.
- Pause/resume: loop state persisted per step, resume continues from the last durable step.
- Steer: user message injected at the next step boundary. Only spoken/committed text enters context.

### 3.3 Review and apply
- A finished run moves to **Ready for review**: summary, diff per document (split diff in the editor, as with Versionen), checks/tests, cost.
- Actions: Apply all, Apply selected hunks, Request changes, Discard.
- Apply creates a checkpoint first, so Undo is one click. Conflicts with edits the user made meanwhile are shown as a compare, not auto-merged.

### 3.4 Scheduling
- Create a schedule on a studio: cron expression with human-readable description, timezone (default user tz, e.g. Europe/Berlin), missed-run policy, consent level.
- Each fire creates a run in a fresh isolated copy. Scheduled runs never apply by themselves unless the user set the schedule to "auto-apply" and the consent level allows it (default: review).
- Missed-run policy per schedule: **Skip**, **Coalesce** (default: one run for the latest missed slot), **Catch up** (each missed slot, capped at N).

### 3.5 Background agents
- Runs execute without a visible panel. A tray/status indicator shows count of running / needs you / failed.
- **While you were away** card on return (generated from the Rust event log since `last_seen`, not from chat text):
  - Header: "Since Fri 18:40 - 3 runs, 2 need you, 1 failed". Snooze / Dismiss / Mark all seen.
  - Needs you: held consent requests and ready-to-apply changes, with Review / Approve / Deny and the reason it paused.
  - Failed: one-line cause, Retry / Open log.
  - Done: one outcome sentence per run, grouped by document.
- Optional later: heartbeat turn (OpenClaw pattern) that decides whether to surface something; it does not produce the recap.

### 3.6 Task board (multi-agent)
- Board columns map to run state, not user labels: Draft - Running - Needs you - Ready - Applied/Failed.
- One card = one isolated run. Per-card live last-step line, model badge, cost/time, steer, stop.
- Pattern sources: vibe-kanban, cline/kanban, emdash, parallel-code (MIT, ideas copyable). Known gap: all of these are code-only. Ours must show non-code artifacts (docs, sheets, slides, vectors) in the review step. This is a design item, no OSS reference exists.

## 4. Architecture decisions

| # | Decision | Verdict | Basis |
|---|---|---|---|
| A1 | Rust core owns orchestration, consent, persistence, scheduling. GUI and the v12 CLI/TUI use the same core | BUILD (thin) | Phase 1; p18 |
| A2 | Agent loop: prototype `goose-agent` (GDK crate) behind a Somnia-owned interface. Do not embed the full `goose` crate | ADOPT, spike first | p1. `goose-agent` is 0.1.0-alpha, 874 downloads, so keep it replaceable |
| A3 | ACP: Somnia as ACP **client** to run external agents (Claude Code, Codex, goose, ...) as stdio subprocesses; permission requests map to the consent broker. Target ACP v1, design for v2. Not an ACP server for now | ADOPT Rust SDK | p2 |
| A4 | Scheduler: `croner` + SQLite Run-Manager, misfire policy, lease + fencing. No tokio-cron-scheduler (Postgres/NATS only, no misfire), no apalis (RC churn, no misfire policy), no underway (Postgres) | BUILD ~500 LOC on croner | p18 |
| A5 | Sandboxing, two tracks. Shell-exec: thin per-OS launcher (Linux bubblewrap+seccomp/Landlock, macOS Seatbelt, Windows restricted token + dedicated user + firewall rules, elevated setup). Extensions: wasmtime, deny-by-default capabilities. Skip firecracker/nsjail | BUILD + ADOPT wasmtime | p4 |
| A6 | Network from sandboxes via a local proxy with domain allowlist, gated by the consent broker | BUILD | p4 |
| A7 | Checkpoints: content-addressed snapshots (git-style, format-agnostic) as the base. One checkpoint spans files plus run metadata. yrs only for live collab, not for checkpoints. loro is the spike candidate if CRDT history is wanted | BUILD on snapshots | p5 |
| A8 | Memory: `fastembed-rs` + multilingual-e5-small + SQLite (rusqlite) + `sqlite-vec` + FTS5, Rust-owned memory service with scopes, consent, deletion. LanceDB only if scale demands it | ADOPT | p7 |
| A9 | Local inference: Ollama/LM Studio adapters default. Optional embedded backend later via llama-cpp-2 in an isolated worker (or mistral.rs). No own engine | WAIT/optional | p6 |
| A10 | Models: local trial baseline Qwen3.5-9B; benchmark Qwen3.8-27B and Gemma4 for high-memory tier. Llama 4 is not a safe EU default (licence). Cloud adapters must handle provider API differences (OpenAI Responses API, Claude forced-tool limits) | ADOPT + BUILD adapters | p12 |
| A11 | Skills: adopt the Agent Skills `SKILL.md` format. Small Rust layer for discovery, activation, permissions, validation. Keep rules, skills, memory and effect permissions separate. Import Cursor rules / Fabric patterns as content only | ADOPT + BUILD | p14 |
| A19 | Skills library: Agent Skills `SKILL.md` unchanged; sources GitHub repos, skills.sh-compatible index (read-only), local, Somnia curated index; own Skills tab in the extension-store UI; skill `allowed-tools` never auto-approved; scripts sandboxed and consent-gated; trust tiers Unreviewed/Scanned/Verified tied to D10. See 4.4 | BUILD on A11 + A15 | 4.4 |
| A12 | Frontend: adopt assistant-ui selectively via ExternalStoreRuntime, with a Somnia event adapter. Today agent loop, consent and chat state are still TypeScript on branch `somnia-agent`, so they move to Rust | ADOPT presentation only | p11 |
| A13 | Evals: Inspect AI as dev-only runner against the real Rust binary, plus Somnia artifact validators and a DE+EN task suite. Not embedded in the app | ADOPT (dev) | p3 |
| A14 | Security baseline: OWASP LLM Top 10 2025 and Agentic Top 10 2026. Tool descriptions and results are untrusted data. Dry-run/diff preview plus confirmation for high-impact actions | ADOPT as checklist | p8 |
| A15 | Extension store trust: separate publisher identity, review status, package digest and runtime permissions. Pinned minisign key for canonical catalog and digests at launch, Cosign bundles optional, signed sequenced revocation metadata with freshness display. Installation is never execution consent. MCP servers are their own extension type with stronger consent | BUILD + ADOPT | p19b |
| A16 | Cost metering: show per run and per step (tokens in/out, cache, cost, source of the number). Hide cost for local models. Provider-reported cost preferred over our price tables | BUILD | p13 |
| A18 | Cross-app desktop control (opt-in, default off): own thin Rust layer on OS accessibility APIs plus synthetic input (enigo, MIT), exposed to the agent as a consent-gated tool. Study Terminator, Cua Driver, Windows-MCP, Microsoft UFO as references; optionally support their MCP servers as external tool providers. See 4.3 | BUILD thin + ADOPT patterns | 4.3 |
| A17 | Voice (later): thin behaviour state machine in Rust, Silero VAD (MIT) + Smart-Turn (BSD-2) via ONNX. No Pipecat/LiveKit. Barge-in cancels output; only spoken words are committed to context | BUILD, later | p20 |

### 4.1 Run-Manager (A4 detail)

Storage (SQLite, UTC everywhere, display converts):
- `schedules(id, name, cron_expr, timezone, misfire_policy, payload_json, consent_level, enabled, last_planned_at, next_run_at, created_at, updated_at)`
- `runs(id, schedule_id, planned_at, state, claimed_by, fencing_token, lease_expires_at, heartbeat_at, attempt, result_json, started_at, finished_at)`
- run state: pending, claimed, running, done, failed, crashed

Startup catch-up: per enabled schedule, compute occurrences in its tz between `last_planned_at` and now (lookback capped, e.g. 24 h), apply the misfire policy, enqueue. Default Coalesce, and the UI shows when runs were coalesced.

Tick loop: sleep until the next due time, claim due runs atomically, dispatch under a concurrency semaphore and per-run timeout, retry with exponential backoff to max attempts.

Lease + fencing (pattern from `underway`): claim sets instance id, fencing token and lease expiry. Heartbeat every TTL/3. On startup, runs with expired leases become `crashed`, then requeue or fail visibly. The fencing token is checked before committing side effects, so a slow resurrected task cannot double-commit.

DST policy: nonexistent local time (spring forward) -> skip that occurrence. Ambiguous (fall back) -> fire once, first occurrence. croner's edge behaviour is not source-verified, so it needs tests before shipping.

### 4.3 Cross-app desktop automation (D12: in, opt-in, default off)

Research date 2026-10-11. Search-result and README level, no code run, no builds. Stars and licences come from the GitHub pages as fetched; verify the LICENSE file before copying any code.

**What it means:** the agent can operate other desktop apps (open Excel, click, fill a browser form) through accessibility APIs and/or synthetic mouse and keyboard.

Candidates:

| Project | Licence | Stars / maturity | Platforms | Approach | Verdict |
|---|---|---|---|---|---|
| Terminator (https://github.com/mediar-ai/terminator) | MIT | 1.5k stars, 279 releases, v0.24.32 (2026-04-05), Rust SDK on crates.io (terminator-rs). Company-backed (raised $2.8M per README) | **Windows only** (README feature table: macOS and Linux "not supported") | UIA accessibility tree, "Playwright for the desktop", MCP server, runs without taking over cursor | Best Rust reference for Windows. Study design, consider as external MCP provider. Do not depend on it for macOS |
| Cua Driver / Cua (https://github.com/trycua/cua) | MIT repo; Cua Spaces app is source-available FSL-1.1-MIT. Per-directory licence for Driver not checked | 22k stars | macOS, Windows, Linux per README (platform boundaries documented separately, not read). Background delivery without moving the pointer where the app supports it | CLI, MCP and SDKs; also local VMs (Lume) and a benchmark | Strongest cross-platform candidate. Use as reference and possible external MCP provider. Spaces/VM route is a heavier, separate product idea |
| Windows-MCP (https://github.com/CursorTouch/Windows-MCP) | MIT | 6.9k stars, v0.8.8 on 2026-10-10 (active) | Windows 7 to 11 | MCP server, UIA state + mouse/keyboard, optional vision, DOM mode for Chrome/Edge/Firefox | Active and popular. Python. External MCP provider candidate |
| MacOS-MCP (https://github.com/jeomon/macos-mcp) | MIT | 130 stars, created 2026-03 | macOS | MCP server | Young. Reference only |
| macos-automator-mcp (https://github.com/steipete/macos-automator-mcp) | MIT | 875 stars | macOS | AppleScript/JXA runner | Useful for scriptable apps. Reference |
| Microsoft UFO (https://github.com/microsoft/UFo) | MIT | 9.9k stars | Windows | Multi-app agent OS, research-grade, Python | Pattern source (multi-app planning). Too heavy to embed |
| UI-TARS-desktop (https://github.com/bytedance/UI-TARS-desktop) | Apache-2.0 | 38.7k stars | Not checked | Vision-model GUI agent app | Different shape (a full app plus its own model). Reference only |
| enigo (https://github.com/enigo-rs/enigo) | MIT | 1.8k stars, v0.6.1 | Windows, macOS, Linux X11; Wayland experimental | Rust input simulation crate | ADOPT as the input layer |
| Anthropic computer-use reference (https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/computer-use-tool) | n/a | Docs and quickstarts | n/a | Screenshot-based loop | Not code to embed. Source of the security guidance below |

Smaller, unverified: Auto-Use (120 stars, Apache-2.0), enikk (58 stars, MIT), agent-computer-use (42 stars, MIT), OpenComputer (2 stars). Not recommended.

**Recommended design (A18):**
- Rust core owns a `desktop` tool: list windows, read UI tree (UIA on Windows, AX on macOS), click/type/scroll through enigo, screenshot (xcap lead from p16, not verified). Accessibility tree first, screenshot fallback, since tree-based control is cheaper and sturdier than pixel loops (vendor claim from Terminator, not independently measured).
- Optional MCP bridge: Somnia's MCP host can attach Cua Driver, Windows-MCP or Terminator as external servers, each as a separate extension type with its own consent (A15).
- Linux: tiered, see 4.3.1 (X11/XWayland first, GNOME/Sway Wayland as beta via portals).

**Platform constraints (sourced):**
- Windows: UI Automation works across processes, but UIPI blocks a lower-integrity process from controlling higher-integrity ones (elevated windows, UAC dialogs, locked desktop). Somnia should run unelevated and show "cannot control elevated app". Sources: https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-securityoverview , https://learn.microsoft.com/en-us/troubleshoot/power-platform/power-automate/desktop-flows/ui-automation/uipi-issues
- macOS: needs Accessibility permission, and screen capture needs Screen Recording permission. These grants attach to the specific binary, and unsigned or ad-hoc signed builds are unreliable for screen-recording checks (https://github.com/CapSoftware/Cap/issues/1722, https://openintelligence-labs.github.io/secondbrain-docs/guides/permissions/). Somnia macOS DMGs are ad-hoc signed today, so macOS desktop control is dropped for now (Philipp), so this only matters if it returns. Sequoia also re-prompts for Screen Recording periodically (p16, not re-verified).

**Security model (opt-in, default off):**
1. Master switch in Settings > Vibe Space > Desktop control, off by default. Turning it on shows what it can do and the OS permissions it needs.
2. Anthropic's own guidance: use a dedicated VM or container with minimal privileges, avoid sensitive data, and the reference implementation says running outside a VM is strongly discouraged (https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/computer-use-tool , https://github.com/anthropics/claude-quickstarts/blob/main/computer-use-best-practices/README.md). Somnia cannot assume a VM, so desktop control is **per-app allowlist**: the user picks which apps an agent may touch. Everything else is blocked.
3. Screen content is untrusted data. Text on a web page or in a document must never act as an instruction (OWASP LLM01 prompt injection, https://genai.owasp.org/llmrisk/llm01-prompt-injection/ ; OWASP Agentic Top 10, A14).
4. Every action goes through the consent broker. Default: ask per action for click/type/submit, with "allow for this run in this app". Sending, deleting, purchasing, password and payment fields: always ask, never covered by auto-approve.
5. Visible indicator while the agent controls the desktop, one-key global kill switch (stop run + release input), full action log in the run history.
6. No screenshots or UI text sent to cloud models unless the user has chosen a cloud model for that run. Local-model runs keep it on the machine. Show a notice when a cloud model will see the screen.
7. Not available in scheduled/background runs unless the user opts in per schedule, because nobody is watching. Default: desktop-control tools are stripped from scheduled runs.
8. Run under the user's account, never elevated.

All sub-questions DECIDED (Philipp, 2026-10-11): per-app allowlist; own Computer Use settings area; Windows and Linux only, macOS dropped for now; external MCP providers first, own layer second. Linux scope: see 4.3.1. Note: Terminator and Windows-MCP are Windows-only; for Linux the cross-platform candidate is Cua Driver (docs verified, not run), plus atspi/ashpd/enigo as building blocks for the later own layer.

**Settings > Computer Use (new area):**
- Master switch "Allow desktop control" (off by default) with a plain explanation of what it can do and which OS prompts follow.
- Providers: list of attached external MCP providers (Cua Driver, Windows-MCP, Terminator, ...) with enable toggle, version, and status. Each provider is its own extension entry with its own consent (A15).
- **App allowlist:** apps the agent may control (picked from running/installed apps), per-app mode: Ask each action / Allow for this run. Apps not on the list are blocked. No "allow all".
- Always-ask actions (send, delete, purchase, password/payment fields) shown as locked rows.
- Session capability panel: shows X11 / Wayland + compositor, and what works there (4.3.1).
- Cloud-vision notice, kill-switch shortcut, action log link, scheduled-run toggle (off by default).
- Windows: note "cannot control elevated apps". Linux Wayland: note "prompts via system dialog".

#### 4.3.1 Linux follow-up (2026-10-11)

Sourced from crates.io, docs, vendor docs; nothing built or run.

- **Accessibility tree: AT-SPI2.** Rust crate `atspi` (https://crates.io/crates/atspi , https://github.com/odilia-app/atspi), pure Rust on zbus, Apache-2.0 OR MIT, v0.30.0, last push 2026-07-08, but only 57 stars and 25 open issues (small, screen-reader-driven project). Works on X11 and Wayland, if the target app exposes accessibility. Reading is fine; apps with poor a11y (many custom-drawn or Electron-off-by-default UIs) give thin trees. GNOME is developing a push-based replacement (Newton), still draft: https://blogs.gnome.org/a11y/2024/06/18/update-on-newton-the-wayland-native-accessibility-project/
- **Input on X11:** works (enigo xdo, Cua uses XTest). Good support.
- **Input on Wayland:** no global "send click" by design. The sanctioned route is the XDG RemoteDesktop portal with EIS/libei (https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html). The user sees a permission dialog. Persistence via `persist_mode`/`restore_token` exists in the portal API. Rust wrapper `ashpd` (https://github.com/bilelmoussaoui/ashpd) covers RemoteDesktop and ScreenCast. libei is supported by KDE per enigo issue #378 discussion; GNOME portal/libei input is listed as proven by Cua. enigo's Wayland and libei backends are unreliable: issue #453 (libei breaks X11 input), #378 (no protocol available on Wayland), #513 (no XDG portal support, repeated permission dialogs). **So enigo is fine on X11 only; on Wayland use ashpd + libei directly.**
- **Screen capture on Wayland:** ScreenCast portal via PipeWire (ashpd), with a user prompt. xcap's Wayland capture goes through the same portal prompts (p16).
- **Compositor spread is real** (Cua docs, https://cua.ai/docs/cua-driver/concepts/platform-support): X11 supported; Sway supported with limits; GNOME/Mutter supported with limits (needs a bundled Shell helper and one Shell restart, per Cua); KDE/KWin and Hyprland experimental; XWayland supported with limits. Raw input to an occluded window generally does not work on Wayland, semantic actions via AT-SPI do. A portal grant belongs to the runtime that received it and may prompt again after restart.
- **Cua Driver verified (docs, not run):** supports Windows, macOS, Linux (x86_64 only per install doc), no admin needed to install. Own support levels are: Windows "Supported" (Electron, Tauri, WPF, WinUI 3, WebView2; elevated-integrity targets refuse or are unproven), macOS "Supported" (needs Accessibility + Screen Recording), Linux X11 "Supported with toolkit limits", Linux Wayland "Supported with compositor limits" and opt-in via `CUA_DRIVER_RS_ENABLE_WAYLAND=1`. It returns structured refusals instead of silent success, which matches our consent model. Its docs say Tauri apps are covered, relevant because Somnia is Tauri.
- **Security note:** Wayland's accessibility keyboard-monitor path has been shown to expose raw keystrokes to an unprivileged process that claims a D-Bus name (https://linnemanlabs.com/posts/hello-my-name-is-orca/ , third-party write-up, not independently verified). Reason to keep Somnia from using keyboard-monitor APIs and to treat the AT-SPI bus as sensitive.

**Linux scope for 12.2.0 - LOCKED (Philipp, "passt", 2026-10-11). Fallback preference from Philipp: if Linux does not work, ship Windows-exclusive:**
1. Tier 1 (ship): X11 and XWayland: AT-SPI tree via `atspi`, input via enigo/XTest, capture via xcap.
2. Tier 2 (ship as "beta" with a compositor list): GNOME and Sway on Wayland via ashpd RemoteDesktop + ScreenCast. Documented as prompting the user, semantic actions preferred.
3. Tier 3 (not promised): KDE/KWin, Hyprland and other compositors, shown as "experimental" in the UI.
4. Consider Cua Driver as the external MCP provider for Linux while our own layer matures, since it already documents these limits.
5. UI must show what is possible in the current session (X11 / Wayland + compositor) before the user turns desktop control on.

Still unverified: real-world reliability of ashpd RemoteDesktop on GNOME 4x/KDE Plasma 6 in our Tauri app, Flatpak/Snap packaging impact (portals behave differently when sandboxed), and whether Somnia's AppImage/deb installs can hold persistent portal grants.

### 4.4 Skills library (Philipp's GO, 2026-10-11)

Builds on A11. A skill is a folder with a `SKILL.md` (YAML frontmatter + Markdown) plus optional `scripts/`, `references/`, `assets/`. Browse, install and share skills in the same store UI as extensions, as its own **Skills** tab.

**Ecosystem state (checked 2026-10-11, search/docs level):**
- Open standard: https://agentskills.io (spec https://agentskills.io/specification , repo https://github.com/agentskills/agentskills). Required frontmatter `name` (max 64 chars, lowercase/digits/hyphens) and `description` (max 1024 chars); optional `license` and others. `allowed-tools` is marked **experimental** in the standard, widely used in Claude Code (third-party frontmatter reference, not the spec page). Adopted by Codex (https://developers.openai.com/codex/skills) and Cursor (https://cursor.com/docs/skills); a third-party site claims 33+ products, not verified.
- skills.sh (https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem): Vercel's directory and leaderboard for skill packages (browse by category/popularity, install stats), plus the `skills` CLI (`npx skills add <owner/repo>`, repo https://github.com/vercel-labs/skills , MIT, 33.5k stars, 1,082 open issues; README says it supports "Claude Code, Codex, Cursor and 75 more"). Skill packages are plain GitHub repos. A package can hold many skills (`--skill <name>`).
- Takeaway: there is no central registry to run. Distribution is GitHub repos, and skills.sh is an index on top. Somnia does not need to invent a format or a host.

**Design:**
1. **Format:** Agent Skills `SKILL.md` as-is, no Somnia fork. Somnia-only metadata goes in a sidecar or the spec's metadata field, never in new top-level keys.
2. **Sources (import/share):** (a) GitHub repo URL / `owner/repo` (same convention as `npx skills add`), (b) a skills.sh-compatible index as a read-only discovery source, (c) local folder / zip, (d) Somnia's own curated index in the extension-store catalog (A15). Sharing = publish a repo, or export a skill folder; "Share" in the UI copies the repo reference.
3. **Skills tab in the store:** search, categories, publisher, source, version/commit pin, last scan result, requested permissions, "installed in: this Vibe Space / all". Same install flow, trust badges and revocation metadata as extensions (A15).
4. **Scopes:** per Vibe Space (stored in the project) or user-wide. Project skills never auto-activate in other spaces.
5. **Activation (A11):** discovery reads metadata only; the body loads when the agent picks the skill or the user invokes it; resources load on demand. Keep main instructions under the standard's recommendation (500 lines / 5k tokens).
6. **Permissions:** a skill's instructions grant nothing. Anything a skill does still goes through the consent broker. `allowed-tools` from a skill is **ignored as pre-approval** by default and shown as "requested", because the field is experimental and skills are untrusted input. Scripts inside a skill run only in the sandbox (A5) and only after consent.
7. **Trust tiers (ties to D10):** restricted mode is the default. Installing a skill never executes its scripts. Tiers: *Unreviewed* (instructions readable only, scripts disabled), *Scanned* (automated checks passed, scripts need per-run consent), *Verified* (review by Somnia, as for verified extensions in D10). Unverified skills can still be used as pure instructions, with a banner.
8. **Scanning on install and on update:** show the full SKILL.md and every script before first activation, diff on update, pin to a commit, flag hidden/obfuscated text and instructions like "do not tell the user", network calls, credential paths, shell piping. A clean scan is not a safety guarantee.
9. **Import of other formats:** Cursor rules and Fabric patterns import as skills (content only, A11).

**Why the security part is not optional (sources):**
- USENIX Security 2026 study of 98,380 skills from two registries: skills "execute with full user privileges" and malicious ones exist in the wild (https://www.usenix.org/system/files/usenixsecurity26-liu-yi.pdf).
- CSA research note (2026-06-24): over 1,184 malicious skills confirmed in one marketplace between Feb and May 2026, delivering a credential stealer; metadata-only attacks can manipulate discovery ranking (https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-skill-supply-chain-attacks-20260624-csa/).
- OWASP Agentic Skills Top 10, AST01 malicious skills hide payloads in SKILL.md prose as well as scripts (https://owasp.org/www-project-agentic-skills-top-10/ast01.html).
- Consequence: popularity rankings (installs, stars) are not trust signals in the Somnia UI. Do not sort the default view by installs alone.

**Decided (Philipp, 2026-10-11) - LOCKED:**
- (a) Default skill sources: GitHub repos plus skills.sh as a read-only discovery index.
- (b) Somnia ships first-party skills per studio (Code, Documents, Slides, ...) as the "Verified" seed.
- (c) Scheduled/background runs: only instruction-only skills run by default. Script-bearing skills need an explicit opt-in per schedule.

Not verified: skills.sh's own listing/review process and API (no documented API read), licence per skill in the wild, how many Agent Skills products really implement the standard.

## 5. UX sketches (text)

### 5.1 Vibe Space home
```
+--------------------------------------------------------------+
| Vibe Space: "Website Relaunch"            [+ New studio] [..] |
|--------------------------------------------------------------|
| Needs you (2)                                                |
|  o Landing copy   Ready for review   3 files  $0.41   [Review]|
|  o Newsletter     Paused: wants to send network request [Allow/Deny]|
| Running (1)                                                  |
|  o Image alt-text pass   step 14: scanning /img    qwen3.5 0:12|
| Scheduled (2)                                                |
|  o Weekly broken-link check   Mon 09:00 Berlin   next in 2d  |
| Done / Failed                                                |
+--------------------------------------------------------------+
```

### 5.2 Studio detail
Left: goal + steps (last step highlighted). Centre: live preview or diff. Right: checkpoints timeline, consent log, cost. Bottom: steer input, Stop, Pause.

### 5.3 Schedule dialog
Cron field with live description ("Every Monday at 09:00, Europe/Berlin"), next 3 fire times, missed-run policy radio (Skip / Coalesce / Catch up), consent level, auto-apply toggle (off by default, with warning), and a line stating whether Somnia must be running (see D1: autostart/tray is opt-in).

### 5.4 Consent prompt
What, where, why, scope (path/domain/command), Allow once / Allow for this run / Deny. Sandbox-level indicator: "Strong (Linux/macOS)" or "Medium (Windows, elevated setup needed for network fence)".

## 6. Delivery slicing proposal for 12.2.0

1. Vibe Space container + studio start/stop + isolated copy + checkpoints + review/apply (no scheduling).
2. Consent broker + sandbox launchers (macOS/Linux first, Windows with indicator).
3. Run-Manager (croner + SQLite) + schedules + return card.
4. Task board.
5. Memory, skills.
6. Desktop control (opt-in, A18): Windows and Linux only (Philipp, 2026-10-11). **macOS is dropped until further notice.** External MCP providers first (Cua Driver, Windows-MCP), own thin layer later.
7. Skills library (4.4): install from GitHub/skills.sh, Skills tab, scan + trust tiers; seed with first-party skills. Needs A15 store UI and consent broker (step 2).
8. Optional: ACP client, embedded inference, voice.

Rough effort numbers exist only for goose spikes (p1): 3-5 days for a `goose-agent` spike, 2-4 days for an ACP spike. Everything else is not estimated.

## 7. Product decisions for Philipp (all decided)

| # | Question | Options | Recommendation |
|---|---|---|---|
| D1 | **RESOLVED (Philipp):** Autostart/tray YES as opt-in. Default: scheduled runs only while the app is open. Schedule dialog still states this. Separate CLI/TUI daemon stays a later option. | | |
| D2 | **LOCKED (Philipp, 2026-10-11, "alles wie vorgeschlagen"):** Coalesce. (Question was: Default missed-run policy) | | |
| D3 | **LOCKED (Philipp, 2026-10-11, "alles wie vorgeschlagen"):** opt-in per schedule, default off. (Question was: Auto-apply for scheduled runs) | | |
| D4 | **RESOLVED (Philipp):** `vadivam:bot` exists (https://icon-sets.iconify.design/vadivam/?icon-filter=bot), no typo. Keep `vadivam:bot`. | | |
| D5 | **LOCKED (Philipp, 2026-10-11, "alles wie vorgeschlagen"):** ask-for-writes. (Question was: Default autonomy level for a new Vibe Space) | | |
| D6 | **LOCKED (Philipp, 2026-10-11, "alles wie vorgeschlagen"):** both modes with indicator, default unelevated + per-command consent. (Question was: Windows sandbox strength: elevated one-time admin setup for network fence, or accept weaker "unelevated" mode) | | |
| D7 | **LOCKED (Philipp, 2026-10-11, "alles wie vorgeschlagen"):** goose-agent spike behind our interface. (Question was: Agent engine: goose-agent first, or Somnia's own loop first) | | |
| D8 | **RESOLVED (Philipp):** no clash. Sessions are "Studio", container is "Vibe Space". No rename. | | |
| D9 | **LOCKED (Philipp, 2026-10-11, "alles wie vorgeschlagen"):** show cost only when nonzero. (Question was: Cost display default) | | |
| D10 | **LOCKED (Philipp, 2026-10-11, "alles wie vorgeschlagen"):** restricted mode default, review only for "verified". (Question was: Extension store: who does human review at launch) | | |
| D11 | **LOCKED (Philipp, 2026-10-11):** Qwen3.5-9B as the single local trial model, decision after DE+EN eval. NO second lean model for now ("1x reicht fuer den Start"). | | |
| D12 | **LOCKED (Philipp, 2026-10-11):** cross-app desktop automation is IN for 12.2.0, **opt-in, default off**. (1) Per-app allowlist, in its own **Computer Use** settings area. (2) Windows and Linux only; **macOS dropped until further notice**. (3) External MCP providers first, own thin layer second. Basis: sections 4.3 and 4.3.1. | | |

## 8. Known gaps in the research (do not treat as decided)

- **Cross-app automation:** the old p17/p17b gap is closed by section 4.3 (this round, search/README level). Still unverified: Cua Driver per-directory licence and platform limits, code quality of any candidate, macOS permission behaviour with Somnia's own signed build.
- **Desktop context detection (p16):** leads only (active-win-pos-rs, x-win, xcap, Screenpipe). Stars, licences and releases not verified. Wayland has no portable active-window API, so treat as degraded.
- **Extension marketplace security (p19):** first report was a design proposal without sources. The second (p19b, attached to Main as `vibespace-extension-marketplace-security-report`) is the source-checked one, and A15 relies on it. I could only read its summary message, not the file.
- **Sandboxing:** macOS `sandbox-exec` deprecation risk was from recall, not verified. Codex licence not verified before copying any code.
- **Scheduling:** croner DST behaviour and apalis-sqlite lease internals not source-verified. Not diffed against Somnia's Cargo tree (is sqlx/SQLite already in the core?).
- **Checkpoints:** yrs licence needs a LICENSE-file check (crates.io says MIT, GitHub says "Other"). jj-lib licence not re-verified.
- **Goose:** estimates are judgment numbers, nothing was compiled or benchmarked.
- **Models/benchmarks:** no controlled German tool-use comparison exists for the current models.
- Stars and versions everywhere are point-in-time (2026-10-10).

## 9. Source index (primary, from the reports)

- Goose: https://github.com/aaif-goose/goose , https://crates.io/crates/goose-agent
- ACP: https://agentclientprotocol.com , https://github.com/agentclientprotocol/rust-sdk
- Scheduling: https://lib.rs/crates/croner , https://github.com/maxcountryman/underway , https://github.com/apalis-dev/apalis , https://github.com/mvniekerk/tokio-cron-scheduler
- Sandboxing: https://github.com/containers/bubblewrap , https://openai.com/index/building-codex-windows-sandbox/ , https://github.com/anthropic-experimental/sandbox-runtime/
- Checkpoints: https://docs.replit.com/features/version-control/checkpoints-and-rollbacks , https://github.com/loro-dev/loro , https://docs.jj-vcs.dev/latest/technical/concurrency/
- Task board: https://docs.replit.com/features/agent/task-board , https://github.com/BloopAI/vibe-kanban , https://github.com/cline/kanban
- Return UX: https://agentic-ux.com/patterns/return-moment , https://docs.openclaw.ai/heartbeat/
- Memory: fastembed-rs v7.1.1 and sqlite-vec v0.1.9 (URLs in the p7 report, not re-listed here)
- Skills: https://github.com/agentskills/agentskills
- Security: https://genai.owasp.org/llm-top-10/ , https://github.com/OWASP/AISVS
- Voice: https://github.com/snakers4/silero-vad , https://github.com/pipecat-ai/smart-turn
- Models: https://dev.meta.ai/llama/llama4/use-policy , https://developers.openai.com/api/docs/models/gpt-6.1-sol
- Frontend: https://www.assistant-ui.com/docs/runtimes/custom/external-store
