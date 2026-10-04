# 2. Manifest reference

The manifest is a JSON object. Somnia validates it on install and rejects it with a message listing every problem.

```json
{
  "id": "acme.hello",
  "name": "Hello",
  "version": "1.0.0",
  "apiVersion": 1,
  "permissions": ["commands", "ui.notify"],
  "contributes": {
    "commands": [{"id": "acme.hello.say", "title": "Say hello", "category": "Tools"}]
  },
  "code": "await somnia.commands.register('acme.hello.say', async () => { await somnia.ui.notify('Hello'); });"
}
```

## Top-level fields

| Field | Type | Required | Rules |
| ----- | ---- | -------- | ----- |
| `id` | string | yes | `vendor.name`, lowercase letters, digits and dashes, at least two dot-separated parts, up to 100 characters. Installing the same id replaces the old version. |
| `name` | string | yes | Up to 80 characters. Shown in menus and Settings. |
| `version` | string | yes | `x.y.z` (three numbers). |
| `apiVersion` | number | yes | Must be `1`. Other values are rejected. |
| `permissions` | string[] | yes | Known permission names only, see [Permissions](03-permissions.md). Use `[]` for none. |
| `code` | string | no | Worker program, up to 100000 characters. |
| `main` | string | no | Reserved for file-based packages. Must be a relative path without `..`. Round 1 runs the inline `code` field, not `main`. |
| `contributes` | object | no | See below. |

## `contributes`

Each list may hold at most 200 items.

### `commands`

`{ "id", "title", "category" }`

- `id` must start with the extension id plus a dot (`acme.hello.say` for `acme.hello`).
- `title` up to 80 characters.
- `category` is one of `Project`, `Edit`, `View`, `Insert`, `Tools`, `Help`. It decides the menu bar menu.
- Declaring commands requires the `commands` permission.
- A declared command in an extension without `code` reports "has no code in this extension". A declared command whose code never called `commands.register` reports "No handler registered for <id>".

### `snippets`

`{ "language": "html" | "css" | "js", "label", "body" }`, body up to 8000 characters. `$1` style tab stops are not interpreted; the body is inserted as written.

### `codeThemes`

`{ "id", "label", "light": {...}, "dark": {...} }`

- `id` lowercase letters, digits and dashes. The theme is registered as `<extension id>.<theme id>`.
- `light` and `dark` may only set `--syntax-tag`, `--syntax-keyword`, `--syntax-string`, `--syntax-number`, each to a hex color (`#rgb` up to `#rrggbbaa`).

### `panels`

`{ "id", "title", "side": "left" | "right", "html" }`

- `id` lowercase letters, digits and dashes. `title` up to 40 characters. `html` up to 50000 characters.
- See [Panels](05-panels.md).

## Validation behavior

Unknown permissions, wrong types, oversized values, a command id outside the extension namespace and non-color theme values are errors. An invalid manifest is never installed. See [Troubleshooting](10-troubleshooting.md) for the messages.

Next: [Permissions](03-permissions.md).
