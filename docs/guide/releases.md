# Roadmap and releases

## Checked release baseline

| Release | Scope |
| --- | --- |
| [v12.0.1](https://github.com/philppplik/somnia/releases/tag/v12.0.1) | Latest stable checked; startup black-window hotfix; Windows/Linux and Apple-silicon macOS assets |
| [v12.1.5-alpha.1](https://github.com/philppplik/somnia/releases/tag/v12.1.5-alpha.1) | Git publication review, remote layer and smart file intake; Windows/Linux |
| [v12.2.0-alpha.3](https://github.com/philppplik/somnia/releases/tag/v12.2.0-alpha.3) | ACP runtime/consent and MCP hardening; computer-use preparation only |
| [v12.2.0-alpha.5](https://github.com/philppplik/somnia/releases/tag/v12.2.0-alpha.5) | Linked-resource live view and Save/Close all |
| [v12.2.0-alpha.7](https://github.com/philppplik/somnia/releases/tag/v12.2.0-alpha.7) | Studio shell, command/Agent parameter forms; Windows/Linux only |
| [v12.2.0-beta.1](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.1) | First public beta and first macOS build (Apple Silicon DMG, ad-hoc signed, not notarized); same code as alpha.7 |
| [v12.2.0-beta.2](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.2) | Experimental deploy, frameworks and Somnia CLI; page scripts run in live preview by default; `somnia attach` fix |
| [v12.2.0-beta.3](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.3) | Vibe Space stale-owner fix, context chip and its Settings toggle removed, `somnia attach` race fix |
| [v12.2.0-beta.4](https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.4) | Latest pre-release checked. Signed in-app update on alpha and beta channels, native Windows ARM64 and Linux ARM64 builds, settings export/import with restore point, studio lifecycle (Settings > Advanced > Performance), per-studio layout restore. Unsigned installers; no Intel macOS build |

Checked **14 October 2026**. This is a snapshot, not an automatic latest-version feed. Use [all releases](https://github.com/philppplik/somnia/releases) for later publications and their known issues.

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
