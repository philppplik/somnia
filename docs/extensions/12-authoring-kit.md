# 12. Authoring kit

A small command line kit to start, check and package an extension. It uses the same parser as the app, so a package that passes here installs in Somnia.

Run it from `phase1` (needs `npm ci` once). Pass arguments after `--`.

| Command | What it does |
| ------- | ------------ |
| `npm run ext -- init acme.my-tool "My Tool"` | Creates a `my-tool/` folder from the template and validates it. |
| `npm run ext -- validate my-tool` | Checks the manifest and the package. Errors exit with code 1. Warnings do not fail. |
| `npm run ext -- pack my-tool` | Validates and writes `my-tool-<version>.zip` plus its SHA-256. |
| `npm run ext -- entry <zip> <folder> --repo ... --ref ... --path ... --author ... --description ...` | Prints the index entry JSON for a packaged extension. See [Publish to the index](13-publish-to-index.md). |

## What validate checks

- Everything the installer checks: manifest fields, known permissions, command ids inside your namespace, theme colors, 2 MB and 200 file limits, safe paths, `main` file present.
- Warnings: no README, no LICENSE, worker code (not accepted by the index yet), `project.write` (reviewers look closely), nothing contributed, `http(s)` URLs in panels (blocked by the panel CSP).

## The template

`templates/extension/` holds a worker extension with one command:

```json
{
  "id": "acme.my-tool",
  "name": "My Tool",
  "version": "0.1.0",
  "apiVersion": 1,
  "main": "main.js",
  "permissions": ["commands", "ui.notify"],
  "contributes": {
    "commands": [{"id": "acme.my-tool.hello", "title": "My Tool: say hello", "category": "Tools"}]
  }
}
```

`main.js` holds readable source; at install time it becomes the `code` string. Edit the permissions table in `README.md` whenever you change permissions.

## Sample extension

`phase1/examples/section-kit` has no permissions and no code: three snippets and an info panel. It is the shape the GitHub index accepts today. Use it to try the whole path (validate, pack, install, publish).

## Install and test locally

1. `npm run ext -- pack my-tool`
2. In Somnia: Settings > Extensions > Add from a .zip package (or Add from a folder).
3. Switch the extension on and press Ctrl+K.

Next: [Publish to the index](13-publish-to-index.md).
