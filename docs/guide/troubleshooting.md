# Troubleshooting

## Install and start

| Problem | What to do |
| --- | --- |
| Black window at start on Windows | You are on v12.0.0. Install v12.0.1 or later. |
| Windows SmartScreen warning | Installers are unsigned. Compare the SHA-256 with `SHA256SUMS` from the release, then continue. |
| macOS says the app cannot be opened | Builds are not notarized. Right-click the app, then Open. Apple silicon only. |
| AppImage does not start | `chmod +x` the file. |
| Installer shows an older version | Alpha and beta assets can carry the base version number. Check the release tag, not the filename. |

## Files

| Problem | What to do |
| --- | --- |
| Blank document is gone | Blank documents live in memory until saved. Save early. |
| Preview is missing styles or scripts | Preview strips scripts. Animation-hidden content shows its end state. Use live view for linked files. |
| Component thumbnail looks unstyled | Thumbnails use a restricted preview. Check the page itself. |
| Strange characters in an old file | Somnia detects Windows-1252, UTF-16 and BOM files and saves as UTF-8. |

## Framework projects

| Problem | What to do |
| --- | --- |
| Preview never starts | Check the Node runtime is installed (Settings > Frameworks). Readiness times out after one minute. |
| Install fails | `package-lock.json` is required. Install runs with scripts disabled. |
| Cannot remove the runtime | A project is still running. Stop it first. |

More: [Frameworks](frameworks.md), [Framework runner](../framework-runner.md).

## Publish

Errors show one plain sentence with an action. Setup and host key questions: [First-time setup](../deploy-setup.md), [Deploy](deploy.md).

## Command line

See the symptom table in [CLI troubleshooting](../cli/troubleshooting.md). Exit code 2 means "needs you", not failure.

## Extensions

[Extension troubleshooting](../extensions/10-troubleshooting.md).

## Report a bug

Open an issue at <https://github.com/philppplik/somnia/issues>. Include the release tag, operating system, steps, expected and actual result. Do not post keys, private files or collaboration invite keys.
