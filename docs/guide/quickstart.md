# Quickstart

Status: **Stable** for the install and open flow. Studio features below the first save may be Pre-release; check [Studios](studios.md).

## 1. Install

Download from [GitHub Releases](https://github.com/philppplik/somnia/releases). Use the latest stable unless you want to test a pre-release.

| Platform | Package |
| --- | --- |
| Windows x64 | `*-x64-setup.exe` or `*-x64.msi`. Also on the Microsoft Store: <https://apps.microsoft.com/detail/9p4ltvzb1hjp> |
| Windows ARM64 (beta.4 and later) | `*-arm64-setup.exe` or `*-arm64.msi` |
| macOS, Apple silicon | `*.dmg`. Builds are not notarized: right-click the app, then Open. |
| Linux amd64 | `*.AppImage` (make it executable) or `*.deb` |
| Linux ARM64 (beta.4 and later) | `*-arm64.deb` only, no AppImage |

Each release lists a `SHA256SUMS` file. Compare it with the file you downloaded. Windows installers are unsigned, so SmartScreen can warn on first run.

Avoid v12.0.0. It had a black-screen bug on Windows, fixed in v12.0.1.

## 2. Open work

1. **Project > Open Folder** for a project, or **Project > Open File** for one file.
2. Pick a file in the Files panel. Its type chooses the studio. Use the studio pill in the header to switch.
3. Press **Ctrl/Cmd+K** for the command palette.

## 3. Save

Save before you close. A new blank document starts in memory only until you save it. Reopen the file once to confirm the save.

## 4. Next

- Learn the studios: [Studios](studios.md)
- Add an AI provider (your own key or a local model): [Settings](settings.md#ai)
- Publish a site: [Deploy](deploy.md)
- Use Somnia from a terminal: [Command line](cli.md)

## Export

The web editor supports ZIP, folder, single HTML and Markdown export. Media studios use their own copy/export flows. Check the output and its destination before discarding your source project.
