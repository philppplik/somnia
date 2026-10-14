# Unreleased: 3D Studio P0

- 3D Studio: snapping (move, rotate, scale steps) for gizmos and nudges, pivot to centre or base, align and distribute for ticked objects (one undo step each), spot and area lights with cone, penumbra, size and colour, OBJ materials from a selected .mtl and its textures (local files only, size-limited, no network), STL unit hint (mm to m), render PNG from a camera object with chosen size and optional transparent background.
- 3D Studio: transform gizmos (move, rotate, scale; W, E, R keys, Tools menu, buttons), numeric fields and Shift+arrows / Page Up / Page Down nudging, one undo step per drag or nudge burst. Camera objects (insert, from current view, field of view, look through). Environment lighting: studio, sky, neutral, none or your own .hdr/.exr, with intensity, rotation and background. Opens .obj, .stl and .ply as well (content-checked, size-limited, three examples loaders in the lazy 3D chunk).
- New 3D Studio (id `3d`, after Photos, before Vibe Space). Opens glTF 2.0 files (.glb, or .gltf with its .bin and textures selected together, meshopt supported), orbit/zoom/pan camera, keyboard orbit, image-based lighting, grid and wireframe toggles, click or list selection, scene outline and model statistics. Hero action "Render still" saves a PNG of the view; Project > Export scene as GLB.
- three.js 0.186.1 (MIT) is loaded only when the studio is shown (own lazy chunk). Dev dependency @types/three 0.186.0.
- Smart Open routes .glb and .gltf (validated by content) to the 3D Studio (open kind `model3d`, handler `open.3d`).
- Staging basics (P1 subset, three core only): insert cube, sphere, plane, cylinder, cone, torus, sun and point lights; numeric position, rotation and scale; PBR color, metalness and roughness; rename, duplicate, delete; undo and redo (one entry per edit); export marks the scene saved; replacing an unexported scene asks first; the scene survives switching studios.
- Not in P0/P1 subset: Smart Open routing of .glb/.gltf, OBJ/STL/PLY, Draco, editing, path tracing, Babylon comparison and the 100k-triangle frame-rate gate (needs a real GPU run on Windows).

# Unreleased: Studio shell regression fixes

- Code Studio restores the inline SVG inspector inside the shared Design section, including paint, fill/stroke gradients, guides, grid and clip/mask controls.
- Vector page settings restore strict SVG replacement as one undoable edit. Rejected or stale imports leave the artwork and history intact.
- Video download/cancel/unavailable notifications follow the video session, including exports started from the new review panel.

# Unreleased: Vector hero export

- Vector Export... opens/focuses the Export panel without writing; output format setup, capped PNG dimensions, separated import controls and five-language labels.

# Unreleased: Design hero export

- Design split Export opens current-artboard SVG or all-artboards ZIP setup and editable project download, with inline status and five-language labels.

# Unreleased: Photos hero export

- Photos header Export opens PNG/JPEG copy setup; shared rail/popover export path, format memory, keyboard shortcut, crop/processing/in-flight gates and five-language labels.

# Changelog

## Unreleased - Slides Present

- Slides now declares Present in the shared header hero slot, with current/from-start interactive commands and F5 / Shift+F5 shortcuts.
- Added static-image full-window/fullscreen presentation, bounded keyboard and click navigation, numeric jumps, black screen, auto-hiding accessible controls and focus restoration.
- Screen-size images obey the renderer budget and pre-render the next slide. Presentation labels are translated in all five locales.
- Added unit and local browser interaction tests. Native fullscreen and production WASM output remain build-device checks.
## Unreleased - Per-studio hero actions

- Code Studio: the header hero is now Preview (the existing live-preview toggle) with a pressed state; it is disabled with the reason "No previewable page" when the open files have no previewable HTML page, and framework projects stay out until their startup review.
- Documents Studio: the header hero is now Export. It opens a small export popup preselected to Word document (.docx) "save a copy"; the copy never overwrites the opened document, and the loss warning with its Save anyway confirmation gates every entry point. `documents.saveCopy` is a real command now (Project menu and palette).
- Sheets Studio: the header hero is now Smart Formula. It opens and focuses the formula builder seeded from the current selection. The builder requires an explicit target cell outside the source range, asks before replacing a non-empty cell and applies the reviewed formula exactly once.
- Hero slot: toggle heroes can render `aria-pressed` (`pressedWhen` / `pressedTooltipKey`), and a disabled hero can explain why via a command's `disabledReason` key.
## Unreleased - Vibe Space task creation

- One New task header action opens the existing creation form without starting work; repeated clicks preserve drafts, and duplicate canvas-header creation actions are removed.


## Unreleased - Video export review

- Video header export opens whole-timeline review/progress with capability gates, deliberate silent output and honest download outcomes.


## Unreleased - Sound export review

- Sound header Export audio opens a processed-clip WAV review with pending-render gates, clip identity checks and save/download/cancel outcomes.

## Unreleased - Update pill prerelease detection

- Compare full release versions, including alpha/beta numbers, so beta.2 detects beta.3 and beta.3 detects beta.10 without offering equal versions or downgrades.
- Changing the channel or automatic-check setting refreshes the pill immediately. Prerelease tags stay out of stable even if a release has the wrong GitHub flag.
- Signed update manifests use the real artifact filenames, reject missing or ambiguous artifacts, and accept prerelease versions in the updater test harness.

## Unreleased - Header hero action slot

- The header slot next to the Account pill can now show a studio's primary action as a split button (main action plus a chevron menu) instead of Publish. Studios opt in with one data field, `header.heroAction`; studios without it keep the Publish button.
- The chevron menu always ends with Publish, so deploy stays reachable. A running publish still shows a spinner on the chevron and in the menu.
- New string `hero.more` in all five languages.

## Unreleased - Studio tabs pill

- Keep the global studio switcher visible when entering Vector or while the legacy raster editor is active.
- Active studio tabs now use the same short names as their tooltips across all ten studios, including Sound, Slides and Vector.

## Unreleased - Slides shell panels

- Slides overview and text outline now provide search, thumbnail loading, compact rows and navigation. The shared inspector adds source-bound text editing, undo/redo, copy export, presentation metrics and compatibility diagnostics.
## Unreleased - Code studio panels

- Code panels use separate registered hosts for files, layers, search, components, CSS and versions.
- Added a filterable DOM outline, responsive preview controls and a section-based inspector with editable link/media/accessibility attributes and source statistics.
- Interaction edits are undoable and refuse locked/read-only nodes, event handler writes and executable URL schemes.
## Unreleased - Code studio shell

- The Code studio runs on the studio shell: the left rail (Layers, Files, Search, Components, CSS, Versions, plus the new Responsive and Outline panels) and the right rail (one inspector with Design, Interactions and Source sections) are declared per studio, with rail icons from the shared registry and tooltips in all five languages.
- Rails are customizable: drag icons to reorder them, right-click to move, pin, hide or reset; the layout survives restarts.
## Unreleased - Photos side panels

- Photos now has real side panels: histogram with clipping stats, Light, Color, Effects and Detail sliders, Transform (crop with aspect presets, straighten, rotate, flip), built-in and saved looks, export, session history with undo, redo and jump, and file info.
- Photos edits are available as commands (`photos.*`) for the command palette. Agents can read state and the histogram but cannot change the image.
## Unreleased - Video studio shell

- Video has a source library and sequence panel, customizable rails, and a selection-aware inspector for trimming, title styling, audio, crossfades and export copies.
- New panel actions use typed interactive commands with five-language labels. Original media stays unchanged.
## Unreleased - Sound studio shell

- Sound now has customizable Audio clips, Selection and Effects rails and a generic audio inspector with source statistics, levels/fades and processing controls.
- Audio edits, selection, listening, transport and WAV-copy export are typed UI commands with five-language titles. Export waits for queued processing instead of saving an older render.

## Unreleased - server frameworks (Next.js, Astro, SvelteKit, Nuxt)

- New project now offers Next.js, Astro, SvelteKit and Nuxt in TypeScript or JavaScript, with pinned lockfiles, a protected loopback preview and a note that the finished app needs Node on the server.
- "Build for publishing" also builds server apps. The result is a `DeployArtifactManifest` of kind `node` (Next standalone, Nuxt `.output`, Astro with `@astrojs/node`, SvelteKit with `adapter-node`). Astro and SvelteKit bundles carry package files and are installed on the server with `npm ci`.
- Telemetry is switched off for every project run (Next, Astro, Nuxt, `DO_NOT_TRACK`). The runner finds Astro's current `bin/astro.mjs`.
- Detection tells static from server output from the project setup: Astro needs `@astrojs/node`, SvelteKit's `adapter-static` means static, Next `output: 'export'` means static.

## Unreleased - live static publishing

- Publish now connects over embedded, pinned-key SSH, checks the prepared server, uploads verified immutable releases, and switches the current site atomically.
- Persistent server pins and OS-keychain deployment keys replace session-only placeholders. Private keys never enter the renderer or project files.
- Publish reports connection, checks, verified file counts, switch and health progress. Cancellation stops before the switch, kept releases can be restored, and a failed health check restores the previous site and Caddy configuration.
- Release history has a read-only current-release lookup. Static framework builds use the existing local output; the separate Node pipeline must be supplied before Node targets can publish.

## Unreleased - first-time publish setup

- Publish setup now walks through key creation, host fingerprint review, the full bootstrap script, and DNS records. A reviewed script can run over pinned SSH using a one-connection login and sudo password; passwords are not saved.
- DNS checks compare system and DNS-over-HTTPS results, warn about stale IPv6 records and missing www, and explain pending HTTPS. Port 80/443 guidance is instructions only; Somnia does not probe or change provider firewalls.
- Public keys can be shown again. Running publishes offer cancellation before the switch. Rollback Live badges use the remote current symlink, not session history.

## Unreleased - static build for publishing

- "Build for publishing" panel for static framework projects (Vite React, Vue, Svelte, Solid, Astro, Next export, SvelteKit static adapter, Nuxt generate): builds locally, finds the output folder from package.json and framework config without running project code, lists every file with its SHA-256 and a stable build ID.
- The artifact is a `DeployArtifactManifest` of kind `static`. Links, `.env*`, keys, `.git` and `node_modules` in the output are refused. Nothing is uploaded.
- Single-page apps show the nginx and Apache fallback rule; it is never written to a server without confirmation.

## Unreleased - Vue, Svelte and Solid projects

- New project now offers Vue, Svelte and Solid next to React, each in TypeScript or JavaScript, with pinned lockfiles and the same protected loopback preview.
- Alt-click in the preview opens the source of an element in Vue and Svelte components as well as JSX.
- Framework projects show their real name in the detected banner (Vue, Svelte, Solid).

## Unreleased - deploy SSH transport

- Embedded SSH/SFTP transport for live deployment: pinned host keys checked before login, keychain key auth, confined atomic uploads, one-time sudo server setup script. No UI yet.

## Unreleased - framework runner

- Explicit-consent framework helper download with pinned SHA-256 verification.
- Local project install, build and protected preview runner with credential scrubbing, redacted bounded logs, timeouts and process-tree cleanup.
- Framework helper status and removal in Settings; isolated native preview with no editor permissions.

## Unreleased - framework projects

- Create React projects from bundled TypeScript or JavaScript templates with pinned lockfiles.
- Detect framework projects without running code; show helper setup, preview controls and redacted app output.
- Keep framework previews on token-protected loopback with a dev-only click-to-source plugin.

## Unreleased

- CLI/TUI: answer a `needs_input` question inside `somnia-tui` (protocol v1 additions `hello` and `answer`, `task.answers` in the engine start message; clients without the handshake behave as before). Real-pty end-to-end test.
- somnia-tui: plain mode for pipes and CI (no raw mode, no ANSI, review left pending, exit 2), golden TestBackend screen snapshots, and a fix for a panic on very narrow terminals.
- Headless `somnia` CLI ships as release archives for Linux and Windows x86_64 (`somnia-cli-<ver>-<os>-x86_64`) with `SHA256SUMS`. `somnia --version` reports the app release, commit and target. No macOS build.

- CLI: `somnia run "<task>"` runs an agent task on a local task branch with exit codes 0 (done), 1 (failed) and 2 (needs input or review). `--yes` makes one local commit; the CLI has no fetch, pull or push path. Background runs (`--detach`, `attach`, `status`, `cancel`) use a private same-user channel (Unix socket, or a user-only named pipe on Windows). Usage errors now exit 1 instead of 2, and `--detach` reports a non-private runtime directory immediately. Docs: [docs/cli/](docs/cli/).
- CLI: `somnia run` now drives the real agent engine. A Node sidecar runs the desktop agent session and file tools headless (OpenRouter, Claude, OpenAI API key, Ollama). Tool calls, model, token usage and cost are logged live and mapped to the TUI. `--bare` skips project notes. Typed failures (auth, consent, budget, scope, conflict) keep their code. See `docs/agent/TASK-ENGINE-CONTRACT.md`.

- Smart Open keeps recognized files automatic. Ambiguous handlers now show a studio chooser; unknown-type files with verified text show an explicit "Open as text?" confirmation. Cancel leaves that file unopened. Unsupported or invalid files only notify. Choosing a studio still uses the normal prepare, unsaved-change approval, revision validation and commit flow. A newer open request closes an older unanswered chooser.

## Unreleased

- Live preview runs page scripts by default in the existing isolated sandbox. A global Preview setting turns scripts off without a prompt; saved per-project choices still take priority.

## 11.2.0-beta.1 - 2026-10-07

- Direct OpenAI/Claude BYOK providers, live catalogs and metadata-only auth.
- Native fixed-endpoint streaming transport with OS-side saved-key resolution.
- Token batching, stopped/interrupted partial answers, safe errors and explicit retry.
- Existing cloud consent, review-only writes and macOS ad-hoc checks retained.

## 11.1.1-beta.1 - 2026-10-07
- Agent: remember provider/model locally and API key in the OS credential store. No plaintext key fallback.
- Agent: create, edit, delete and enable custom prompts, persisted locally and included in every AI provider request. Cloud consent and file access approval remain separate.


- macOS: explicitly ad-hoc sign the complete app bundle, including sealed resources.
- CI: verify DMG integrity and signatures in the app, mounted DMG and updater archive.
- macOS still requires a security exception: this beta is not Developer-ID signed or notarized.

Changes are grouped by product release. Release notes and installation guidance
live in [`docs/releases/`](docs/releases/). Entries describe implemented behavior,
not roadmap promises.

## 11.1.0 - 2026-10-07

This entry collects the beta.6 wave and the features already present in
11.0.0-beta.5. It was released from the commit that passed CI; Windows and macOS acceptance testing by the maintainer is still outstanding. See the
[release-notes draft](docs/releases/v11.1.0.md) for limits and release checks.

### Added

- Collaboration identity from the local profile: Join prefills the profile name;
  a successful join can save a name into an empty profile without overwriting an
  existing one. Hosts use their profile name or the Host fallback. Session-only
  48 x 48 JPEG avatars appear in chat and the mention picker, with initials as
  the fallback. Mentions keep participant IDs rather than matching names alone.
- A session-only Chat button above Agent in the right rail, an unread badge
  capped visually at `9+`, and `Mod+Alt+C` to toggle chat. Opening Agent switches
  back to the Agent tab; ending a session returns the panel to Agent.
- Glass v2: 0-100% opacity, 0-40 px CSS blur, and separate Window frame, Panels
  and Code editor scopes. The Code editor scope is off by default and warns
  below 60% opacity; measurable low-contrast combinations below 55% get a 55%
  floor. Unsupported native backgrounds and high contrast remain solid.
- LaTeX stage 1: lazy-loaded KaTeX formulas in Markdown, `.tex` syntax
  highlighting and a limited text/math preview. Formula errors feed Problems,
  the editor gutter and the status bar. Trust-requiring KaTeX commands are
  blocked; `.tex` file, include and write commands are never executed.
- Native Markdown editing with Source, Split and Preview views, an icon toolbar,
  link and code-block dialogs, list continuation, `Mod+B`/`Mod+I`, bidirectional
  block-based scroll sync, Reveal in source and relative project-file links.
  Preview supports tables, task lists, footnotes and heading anchors. Raw HTML
  is disabled and remote images are not fetched.

### Included from 11.0.0-beta.5

- Encrypted, session-only chat with plain-text messages, replies, participant-ID
  mentions, attachments and local unread state, plus activity-aware code badges.
  Chat is separate from project files, saves, recovery, export and AI context.
- Save, window-close and Close Project dialogs share the Export-style shell,
  file card and action layout. The save dialog shows the actual new-folder name;
  close dialogs keep explicit save/keep, discard and cancel choices.
- Glass blur and inner-panel controls, persisted appearance settings, and a
  configurable 0-25 px outer corner radius. Dialog and control radii remain
  separate from the outer-radius setting.

### Fixed

- Chat uses the shared outer-radius token and no longer duplicates its opener
  in the status bar.
- The Markdown preview uses the KaTeX pipeline with source-line mapping retained.
  Formulas are inserted into text positions, never into HTML attributes; code,
  escaped dollar signs and price-like text remain protected.

### Limitations

- LaTeX preview is not a compiler: no PDF compilation, package processing,
  BibTeX or `\label`/`\ref` support. `align` has one number per block.
- Markdown preview is read-only, including rendered task checkboxes. Scroll sync
  maps rendered blocks, not exact pixel positions. Remote images remain absent.
- Glass needs successful Windows Acrylic/macOS Vibrancy activation. Web, Linux,
  high contrast and failed native activation use opaque backgrounds. CSS blur
  and radius controls do not override the OS desktop blur or window mask.
- Collaboration profile names and avatars are session presentation, not verified
  identity. Chat has bounded history/attachment limits and no persistent archive.
  Native Windows/WebView2 and two-PC LAN/firewall acceptance remain release gates.
