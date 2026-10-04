# 9. Packaging and install

## Package format (apiVersion 1)

An extension is a single JSON file named `somnia-extension.json` (any `.json` name works for installing). Put the program in the `code` string. Keep the file under 300 KB; larger files are refused by the file installer.

Recommended repository layout:

```
my-extension/
  somnia-extension.json
  README.md        what it does, which permissions and why
  LICENSE
```

Write `code` as normal JavaScript while developing, then embed it with a small script that does `JSON.stringify(code)` into the manifest. Keep the readable source in the repository.

## Install

| Way | Steps |
| --- | ----- |
| File | Settings > Extensions > Add from a .json file, choose the file |
| Paste | Settings > Extensions > paste the manifest into the text box > Install |

After install the extension is listed but off. Switch it on, then check its permissions.

Failed installs show a list of problems under the text box; nothing is stored. See [Troubleshooting](10-troubleshooting.md).

## Update and remove

- Update: install the new manifest with the same `id`. The enabled flag and revoked permissions are kept. Raise `version` so users can tell versions apart.
- Remove: the Remove button next to the extension.

## Distribution

There is no marketplace yet. The plan, recorded in [ADR-003](../../phase1/notes/ADR-003-extension-sdk.md), is a GitHub-hosted index of extensions. Until then share the JSON file, for example as a release asset in your own repository.

## Not supported yet

- ZIP or folder packages with separate files (`main`).
- Signed extensions and automatic updates.
- Dependencies between extensions.

Next: [Troubleshooting](10-troubleshooting.md).

## Install from a ZIP or a folder

Settings > Extensions also offers "Add from a .zip package" and "Add from a folder". The package must contain `somnia-extension.json` (or `manifest.json`) at its root or in one top-level folder. If the manifest has `"main": "main.js"` and no `code`, Somnia reads that file from the package and uses its text as `code`. Limits: 2 MB total, 200 files, no `..` paths. Only the manifest and the `main` file are used; other files are ignored.
