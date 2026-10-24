# Roadmap and releases

## Checked release baseline

| Release | Scope |
| --- | --- |
| [v12.0.1](https://github.com/philppplik/somnia/releases/tag/v12.0.1) | Previous stable; startup black-window hotfix; Windows/Linux and Apple-silicon macOS assets |
| [v12.1.5-alpha.1](https://github.com/philppplik/somnia/releases/tag/v12.1.5-alpha.1) | Git publication review, remote layer and smart file intake; Windows/Linux |
| [v12.2.0-alpha.3](https://github.com/philppplik/somnia/releases/tag/v12.2.0-alpha.3) | ACP runtime/consent and MCP hardening; computer-use preparation only |
| [v12.2.0-alpha.5](https://github.com/philppplik/somnia/releases/tag/v12.2.0-alpha.5) | Linked-resource live view and Save/Close all |
| [v12.2.0-alpha.7](https://github.com/philppplik/somnia/releases/tag/v12.2.0-alpha.7) | Studio shell, command/Agent parameter forms; Windows/Linux only |
| [v12.2.0-beta.1](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.1) | First public beta and first macOS build (Apple Silicon DMG, ad-hoc signed, not notarized); same code as alpha.7 |
| [v12.2.0-beta.2](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.2) | Experimental deploy, frameworks and Somnia CLI; page scripts run in live preview by default; `somnia attach` fix |
| [v12.2.0-beta.3](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.3) | Vibe Space stale-owner fix, context chip and its Settings toggle removed, `somnia attach` race fix |
| [v12.2.0-beta.4](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.4) | Signed in-app update on alpha and beta channels, native Windows ARM64 and Linux ARM64 builds, settings export/import with restore point, studio lifecycle (Settings > Advanced > Performance), per-studio layout restore. Unsigned installers; no Intel macOS build |
| [v12.2.0-beta.5](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.5) | Agent conversation follows across studios (opt-in history reuse), handoff hardening, Sheets cut/paste, 3D and accessibility fixes |
| [v12.2.0-beta.6](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.6) | In-app prerelease update channel with signed manifests, studio lifecycle, session recovery checkpoints, settings transfer, shell accessibility pass, Windows ARM64 and Linux ARM64 builds return, Sheets filter slicer and timeline |
| [v12.2.0-beta.7](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.7) | Per-studio lifecycle adapters (Slides, Photos, Sound, Video, Vector, Design), session-safety recovery checkpoints in Documents and Sheets with unsaved-changes prompt, Transcript Hub (local whisper.cpp, TXT export), application-owned job scheduler with leases and priority lanes, extension idle-suspend |
| [v12.2.0-beta.8](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.8) | Studio shell wave 2 across all studios (panels, rails, inspector, header hero actions, per-studio closable tabs), header export/publish actions, Grok (xAI) + Meta + DeepSeek providers, inline bottom terminal (PTY), command terminal and tab docking, framework project adapters, deploy bootstrap dry-run hardening, macOS CLI archive added |
| [v12.2.0-beta.9](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.9) | Advanced export dialogs across studios (PDF, animation, 3D, video, sound, vector), video timeline markers/fades/per-clip colour correction, multi-cursor in Code, sound automation shapes, Sheets CSV/TSV import, Documents footnotes and captions |
| [v12.2.0-beta.10](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.10) | Custom Windows setup preview asset (unsigned, SmartScreen warns; regular setup.exe/MSI stay recommended); installer workflow back in the repository |
| [v12.2.0](https://github.com/philppplik/somnia/releases/tag/v12.2.0) | Latest stable checked; first stable of the 12.2 line, carries everything tested through beta.1-beta.10 |
| [v12.3.0-beta.1](https://github.com/philppplik/somnia/releases/tag/v12.3.0-beta.1) | Studio lifecycle (active/warm/suspended/evicted) with checkpointed sessions across all studios, session-safety recovery checkpoints in Documents and Sheets, application-owned job scheduler with leases and priority lanes, provider reasoning replay (Grok/xAI and Meta via Responses endpoints), per-studio layout restore fix. Windows/Linux ARM64 and macOS assets; unsigned installers |
| [v12.3.0-beta.2](https://github.com/philppplik/somnia/releases/tag/v12.3.0-beta.2) | Latest pre-release checked. Sound Studio Stage C: pause detection with review panel, microphone take recording, transcript-guided segment review (local whisper.cpp, cut suggestions only, no cloud); Vector text-to-path and select-same; Interface advanced export dialog; compact menu on narrow widths; Extensions open-offer dispatch on the v1 host. macOS device validation of the new sound features pending (see mac-test-proben.md on the release); unsigned installers |

Checked **23 October 2026**. This is a snapshot, not an automatic latest-version feed. Use [all releases](https://github.com/philppplik/somnia/releases) for later publications and their known issues.

v12.0.0 is superseded by the hotfix. Stable 12.0.1 still lists a limitation for extension commands with custom argument schemas. Later alpha behavior must not be attributed to that stable installer.

## Roadmap

The canonical [repository roadmap](https://github.com/philppplik/somnia/blob/main/docs/ROADMAP.md) contains historical version plans and estimates. Some sections describe work that later shipped, while other ideas remain proposals. Treat it as planning history and direction, not the current availability matrix.

Current-release behavior is established by release notes, actual assets and the matching tagged code. Design concepts, branch notes and CI runs are supporting evidence, not release announcements.

## Development boundaries

Deploy, frameworks and the Somnia CLI are labelled **experimental** in the beta.2 to beta.4 release notes and may change. No stable date is promised. Computer use is not available in the checked alpha. Desktop acceptance, codecs, generated engine assets and real provider/server behavior can impose separate gates.

See [Deploy](deploy.md), [Frameworks](frameworks.md), [Studios](studios.md) and [AI and Collaboration](ai-and-collaboration.md) for specific limits.

## Release verification

The build guide documents green release-commit checks, installer/checksum assembly and manual platform testing. Release notes may name intentionally skipped platforms. Installer signing and updater signing are separate: a signed updater artifact does not mean the installer is code-signed or notarized.

[Build and release](https://github.com/philppplik/somnia/blob/main/docs/BUILD-AND-RELEASE.md) · [Changelog](https://github.com/philppplik/somnia/blob/main/CHANGELOG.md)
