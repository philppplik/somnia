# SDK v2 manifest reference

> **Generated — do not edit.** Source of truth:
> `phase1/src/lib/extensions/contracts/v2/manifest.schema.json` (JSON Schema 2020-12 over the parsed TOML data model).
> Regenerate with `node scripts/generate-extension-manifest-reference.mjs`; CI fails this page on drift.

Applies to: SDK API v2 (`manifestVersion = 2`, `engines.api` inside major 2).

Every v2 package is a `.somniax` ZIP with exactly one root `somnia-extension.toml`.
The schema is **closed at every level**: unknown keys are errors, not warnings. This
surprises authors from other ecosystems, so it is stated here once and enforced by
`SOM-EXT-002` everywhere. All diagnostics carry an RFC 6901 JSON pointer into the
parsed manifest; see [Error codes](./error-codes.md). Semantic rules the schema
cannot express (namespace equality, engine bounds, activation correspondence,
license expressions, security declaration checks) run in the same validator and are
listed under each field.

## Fields at a glance

| Field | Type | Required | Rule |
| ----- | ---- | -------- | ---- |
| [`$schema`](#schema) | string | no | Editor hint pointing at a copy of the schema. Tools never fetch it. |
| [`manifestVersion`](#manifestversion) | `2` (constant) | **yes** | Manifest contract version. SDK v2 manifests always use `2`. |
| [`id`](#id) | string | **yes** | Globally unique extension ID: `publisher.name`, lowercase with dashes. The first segment must equal `publisher`. |
| [`publisher`](#publisher) | string | **yes** | Your publisher namespace. Every command ID starts with this segment. |
| [`name`](#name) | string | **yes** | Display name shown in Settings and the index. |
| [`version`](#version) | string | **yes** | Stable SemVer (`major.minor.patch`, optional `+build`). No prerelease tags in packages. |
| [`description`](#description) | string | **yes** | One or two plain sentences. Shown on the extension card and the install review. |
| [`license`](#license) | string | **yes** | An SPDX expression such as `MIT`, or `SEE LICENSE IN <path>` naming a file inside the package. |
| [`engines`](#engines) | object | **yes** | Host versions this package runs on. Both ranges are checked at enablement. |
| [`runtime`](#runtime) | one of 3 variants | **yes** | How this package executes. Exactly one variant. |
| [`activationEvents`](#activationevents) | array | **yes** | Events that start the runtime. Every command and panel needs a matching `onCommand:` / `onPanel:` event unless you activate on startup. Store packages may not use `*`. |
| [`permissions`](#permissions) | array | **yes** | Capability strings the install review shows to the user. Ask for the minimum; users can revoke each one per extension. |
| [`capabilities`](#capabilities) | object | **yes** | Behaviour in restricted environments. Both tables are required. |
| [`contributes`](#contributes) | object | **yes** | Everything the extension adds to Somnia. Declarative first: the host registers these before any code runs. Unknown keys here are errors. |
| [`dependencies`](#dependencies) | array | **yes** | Inventory of bundled third-party code: exact versions, licenses and `sha256:` source integrity. The inventory documents provenance; it is not by itself proof of it. |
| [`proposedApis`](#proposedapis) | array | no | Experimental API revisions this package needs. Only the `experimental` lane accepts these. |
| [`repository`](#repository) | string | no | HTTPS source URL, no embedded credentials. |
| [`homepage`](#homepage) | string | no | HTTPS product page URL, no embedded credentials. |
| [`icon`](#icon) | string | no | Package-relative icon shown on cards, the detail page and the install review. |
| [`security`](#security) | object | no | Optional expanded consent declarations. Omitting it means tier A with no filesystem, network, secrets, clipboard or agent rights. See `permissions-security.md` for the consent engine these declarations drive. |

## Full example

A complete, valid `somnia-extension.toml`. CI validates this block against the real
parser on every change.

```toml
"$schema" = "./somnia-extension-v2.schema.json"
manifestVersion = 2
id = "acme.word-count"
publisher = "acme"
name = "Word count"
version = "1.0.0"
description = "Counts words in the current project document without saving to disk."
license = "MIT"
activationEvents = [ "onCommand:acme.word-count.count", "onPanel:acme.word-count.summary" ]
permissions = [ "commands", "project.read", "ui.notify" ]
dependencies = []

[engines]
somnia = ">=11.0.0 <12.0.0"
api = ">=2.0.0 <3.0.0"

[runtime]
type = "js"
entry = "extension.js"

[capabilities.untrustedWorkspaces]
supported = "unsupported"

[capabilities.virtualWorkspaces]
supported = true

[[contributes.commands]]
id = "acme.word-count.count"
title = "Count words"
category = "Tools"
when = "hasProject && studio == \"code\""

[[contributes.panels]]
id = "summary"
title = "Word count"
side = "right"
kind = "declarative"
path = "panels/summary.json"
studios = [ "code" ]

[security]
tier = "A"

[security.fs]
read = "none"
write = "none"
```

## $schema

string · optional · 1–180 chars

Editor hint pointing at a copy of the schema. Tools never fetch it.

## manifestVersion

`2` (constant) · required

Manifest contract version. SDK v2 manifests always use `2`.

## id

string · required · ≤ 100 chars; pattern `^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$`

Globally unique extension ID: `publisher.name`, lowercase with dashes. The first segment must equal `publisher`.

## publisher

string · required · ≤ 40 chars; pattern `^[a-z0-9][a-z0-9-]*$`

Your publisher namespace. Every command ID starts with this segment.

## name

string · required · 1–80 chars

Display name shown in Settings and the index.

## version

string · required · ≤ 64 chars; pattern `^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`

Stable SemVer (`major.minor.patch`, optional `+build`). No prerelease tags in packages.

## description

string · required · 1–300 chars

One or two plain sentences. Shown on the extension card and the install review.

## license

string · required · 1–180 chars

An SPDX expression such as `MIT`, or `SEE LICENSE IN <path>` naming a file inside the package.

## engines

object · required

Host versions this package runs on. Both ranges are checked at enablement.

### Field table

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `somnia` | string | **yes** | 1–100 chars |
| `api` | string | **yes** | 1–100 chars |

### `somnia`

string · required · 1–100 chars

Somnia app range. Explicit lower bound and exclusive upper major: `">=11.0.0 <12.0.0"`. Wildcards and tags are rejected.

### `api`

string · required · 1–100 chars

SDK API range. Must stay inside major 2: `">=2.0.0 <3.0.0"`.

## runtime

one of 3 variants · required

How this package executes. Exactly one variant.

### Variants

- **`declarative`** — No code. Themes, snippets and declarative panels only. Commands are rejected on a declarative runtime.
  - `type` — `"declarative"` (constant), required.
- **`wasm`** — A WebAssembly entry running in the isolated worker with the `somnia-json-1` ABI. The only executable lane browser targets advertise today.
  - `type` — `"wasm"` (constant), required.
  - `entry` — string, required, 1–180 chars; pattern `^(?!/)(?!.*\\)(?!.*(?:^|/)\.\.?(?:/|$))[^\u0000-\u001f]+$`. Package-relative path to the `.wasm` entry.
  - `abi` — `"somnia-json-1"` (constant), required. Wasm ABI contract. Currently always `"somnia-json-1"`.
- **`js`** — A bundled single-file JavaScript entry. Runs on targets that advertise the `js` runtime; check `HostCapabilities.runtimes` and handle `E_INCOMPATIBLE_API`.
  - `type` — `"js"` (constant), required.
  - `entry` — string, required, 1–180 chars; pattern `^(?!/)(?!.*\\)(?!.*(?:^|/)\.\.?(?:/|$))[^\u0000-\u001f]+$`. Package-relative path to the bundled `.js` entry. Bundles must be self-contained; there is no package manager at install time.

## activationEvents

array · required · 0–64 items; unique items

Events that start the runtime. Every command and panel needs a matching `onCommand:` / `onPanel:` event unless you activate on startup. Store packages may not use `*`.

items: string · ≤ 180 chars; pattern `^(?:onCommand:[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*|onPanel:[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*|onLanguage:[a-z][a-z0-9-]*|onStudio:(?:code|documents|sheets|slides|sound|photos|video)|onDocument:[a-z0-9]+|workspaceContains:[^\r\n]+|onProjectOpened|onSelectionChanged|onStartupFinished|\*)$`

## permissions

array · required · 0–6 items; unique items

Capability strings the install review shows to the user. Ask for the minimum; users can revoke each one per extension.

items: `"commands"` | `"project.read"` | `"project.write"` | `"selection"` | `"ui.notify"` | `"storage"`

## capabilities

object · required

Behaviour in restricted environments. Both tables are required.

### Field table

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `untrustedWorkspaces` | one of 2 variants | **yes** |  |
| `virtualWorkspaces` | object | **yes** |  |

### `untrustedWorkspaces`

one of 2 variants · required

Whether the extension runs when the user marks a project untrusted. `limited` needs a `description` and an `allowedPermissions` subset of `permissions`.

#### Variants

- **`supported / unsupported`**
  - `supported` — `"supported"` | `"unsupported"`, required.
- **`limited`**
  - `supported` — `"limited"` (constant), required.
  - `description` — string, required, 1–300 chars.
  - `allowedPermissions` — array, required, 1–6 items; unique items.

### `virtualWorkspaces`

object · required

Whether the extension runs when the project has no real folder on disk.

#### Field table

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `supported` | boolean | **yes** |  |

#### `supported`

boolean · required

## contributes

object · required

Everything the extension adds to Somnia. Declarative first: the host registers these before any code runs. Unknown keys here are errors.

### Field table

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `commands` | array | no | 0–200 items |
| `panels` | array | no | 0–200 items |
| `themes` | array | no | 0–200 items |
| `snippets` | array | no | 0–200 items |

### `commands`

array · optional · 0–200 items

Commands in the palette and menus. IDs are `publisher.name.thing`. A command needs the `commands` permission, an executable runtime and a matching `onCommand:` activation event.

#### Item fields

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `id` | string | **yes** | ≤ 150 chars; pattern `^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$` |
| `title` | string | **yes** | 1–80 chars |
| `category` | `"Project"` \| `"Edit"` \| `"View"` \| `"Insert"` \| `"Tools"` \| `"Help"` | **yes** |  |
| `icon` | string | no | 1–180 chars; pattern `^(?!/)(?!.*\\)(?!.*(?:^\|/)\.\.?(?:/\|$))[^\u0000-\u001f]+$` |
| `when` | string | no | 1–256 chars |
| `argumentsSchema` | object | no | ≤ 32 properties |
| `resultSchema` | object | no | ≤ 32 properties |

- **`id`** — Three-segment ID inside your namespace, e.g. `acme.word-count.count`.
- **`title`** — Verb-first title shown in the command palette.
- **`category`** — Menu group the command appears under.
- **`icon`** — Optional package-relative icon asset.
- **`when`** — Context expression gating availability. Closed boolean grammar over `studio`, `language`, `hasProject`, `hasSelection`, `workspaceTrusted`, `isReadonly` — never JavaScript.
- **`argumentsSchema`** — Closed JSON Schema subset for command arguments: no references, no patterns, no arbitrary keywords, at most 8 levels deep.
- **`resultSchema`** — Closed JSON Schema subset for the command result, same rules as `argumentsSchema`.

### `panels`

array · optional · 0–200 items

Side-rail panels. `declarative` panels are native view trees; `webview` panels render through the isolated panel bridge, never inside Somnia’s own UI tree.

#### Item fields

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `id` | string | **yes** | ≤ 40 chars; pattern `^[a-z0-9][a-z0-9-]*$` |
| `title` | string | **yes** | 1–40 chars |
| `side` | `"left"` \| `"right"` | **yes** |  |
| `kind` | `"declarative"` \| `"webview"` | **yes** |  |
| `path` | string | **yes** | 1–180 chars; pattern `^(?!/)(?!.*\\)(?!.*(?:^\|/)\.\.?(?:/\|$))[^\u0000-\u001f]+$` |
| `icon` | string | no | 1–180 chars; pattern `^(?!/)(?!.*\\)(?!.*(?:^\|/)\.\.?(?:/\|$))[^\u0000-\u001f]+$` |
| `when` | string | no | 1–256 chars |
| `studios` | array | no | 0–7 items; unique items |
| `scripts` | boolean | no | default `false` |

- **`id`** — Panel ID, unique inside the extension. Activation uses `onPanel:<extId>.<panelId>`.
- **`title`** — Panel title shown in the rail tooltip and header.
- **`side`** — Which side rail hosts the panel.
- **`kind`** — `declarative` for a native view tree, `webview` for an isolated HTML surface.
- **`path`** — Package-relative panel asset: view-tree JSON for `declarative`, HTML for `webview`. Budget 256 KiB.
- **`icon`** — Optional package-relative rail icon.
- **`when`** — Context expression gating visibility, same grammar as commands.
- **`studios`** — Studios the panel appears in. Omit to show in every studio.
- **`scripts`** — Webview panels only: whether the page may run its own scripts. Declarative panels must keep this `false`.

### `themes`

array · optional · 0–200 items

Syntax (`code`) or interface (`ui`) themes. Theme assets are limited to 64 KiB.

#### Item fields

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `id` | string | **yes** | ≤ 40 chars; pattern `^[a-z0-9][a-z0-9-]*$` |
| `label` | string | **yes** | 1–80 chars |
| `kind` | `"code"` \| `"ui"` | **yes** |  |
| `mode` | `"light"` \| `"dark"` | **yes** |  |
| `path` | string | **yes** | 1–180 chars; pattern `^(?!/)(?!.*\\)(?!.*(?:^\|/)\.\.?(?:/\|$))[^\u0000-\u001f]+$` |

- **`id`** — Theme ID, unique inside the extension.
- **`label`** — Name shown in the theme picker.
- **`kind`** — `code` for editor syntax colours, `ui` for the interface.
- **`mode`** — Light or dark base mode.
- **`path`** — Package-relative theme JSON asset.

### `snippets`

array · optional · 0–200 items

Snippet sets per language. Snippet assets are limited to 32 KiB.

#### Item fields

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `id` | string | **yes** | ≤ 40 chars; pattern `^[a-z0-9][a-z0-9-]*$` |
| `label` | string | **yes** | 1–80 chars |
| `language` | string | **yes** | ≤ 40 chars; pattern `^[a-z][a-z0-9-]*$` |
| `path` | string | **yes** | 1–180 chars; pattern `^(?!/)(?!.*\\)(?!.*(?:^\|/)\.\.?(?:/\|$))[^\u0000-\u001f]+$` |
| `prefix` | string | no | 1–80 chars |
| `description` | string | no | 1–300 chars |
| `studios` | array | no | 0–7 items; unique items |

- **`id`** — Snippet-set ID, unique inside the extension.
- **`label`** — Name shown in the snippet picker.
- **`language`** — Language the set applies to, e.g. `html`.
- **`path`** — Package-relative snippet JSON asset.
- **`prefix`** — Optional default trigger prefix.
- **`description`** — What the set contains.
- **`studios`** — Studios the snippets apply to. Omit for every studio.

## dependencies

array · required · 0–2000 items

Inventory of bundled third-party code: exact versions, licenses and `sha256:` source integrity. The inventory documents provenance; it is not by itself proof of it.

### Item fields

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `ecosystem` | `"npm"` \| `"cargo"` \| `"other"` | **yes** |  |
| `name` | string | **yes** | 1–180 chars |
| `version` | string | **yes** | 1–64 chars |
| `license` | string | **yes** | 1–180 chars |
| `sourceIntegrity` | string | **yes** | pattern `^sha256:[0-9a-f]{64}$` |


## proposedApis

array · optional · 0–32 items

Experimental API revisions this package needs. Only the `experimental` lane accepts these.

### Item fields

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `id` | string | **yes** | ≤ 40 chars; pattern `^[a-z0-9][a-z0-9-]*$` |
| `revision` | integer | **yes** |  |


## repository

string · optional · ≤ 300 chars; pattern `^https://`

HTTPS source URL, no embedded credentials.

## homepage

string · optional · ≤ 300 chars; pattern `^https://`

HTTPS product page URL, no embedded credentials.

## icon

string · optional · 1–180 chars; pattern `^(?!/)(?!.*\\)(?!.*(?:^|/)\.\.?(?:/|$))[^\u0000-\u001f]+$`

Package-relative icon shown on cards, the detail page and the install review.

## security

object · optional

Optional expanded consent declarations. Omitting it means tier A with no filesystem, network, secrets, clipboard or agent rights. See `permissions-security.md` for the consent engine these declarations drive.

### Field table

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `tier` | `"A"` \| `"B"` | **yes** |  |
| `fs` | object | no |  |
| `network` | array | no | 0–64 items; unique items |
| `secrets` | array | no | 0–32 items; unique items |
| `inject` | array | no | 0–32 items; unique items |
| `agent` | object | no |  |
| `clipboardRead` | object | no |  |
| `clipboardWrite` | boolean | no |  |

### `tier`

`"A"` | `"B"` · required

`A`: sandboxed, the default. `B`: native full trust — manual `.somniax` installs with Developer Mode only; Store validation rejects it.

### `fs`

object · optional

Filesystem scope beyond the open project. `none`, `project` or `ask` (per-target runtime consent). Reads are capped at 512 KiB, writes at 1 MiB, writes are atomic.

#### Field table

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `read` | `"none"` \| `"project"` \| `"ask"` | **yes** |  |
| `write` | `"none"` \| `"project"` \| `"ask"` | **yes** |  |

#### `read`

`"none"` | `"project"` | `"ask"` · required

#### `write`

`"none"` | `"project"` | `"ask"` · required

### `network`

array · optional · 0–64 items; unique items

Exact HTTPS hosts the extension may call. Unique lowercase DNS names, no wildcards or ports. `paths` are case-sensitive prefixes with one optional trailing `*`; omit `paths` to cover the whole host. Every entry needs a plain-text `reason` (20–280 characters) shown at install review.

#### Item fields

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `host` | string | **yes** | 1–253 chars; pattern `^[a-z0-9]+(?:[.-][a-z0-9]+)*$` |
| `paths` | array | no | 0–64 items; unique items |
| `reason` | string | **yes** | 20–280 chars; pattern `^[^<>\u0000-\u001f\u007f]+$` |


### `secrets`

array · optional · 0–32 items; unique items

Secret slot names the extension uses. Users fill slots in Settings; extension code never reads values.

items: string · pattern `^[A-Za-z][A-Za-z0-9_-]{0,63}$`

### `inject`

array · optional · 0–32 items; unique items

Header injection rules: one declared secret into one declared host. Transport and cookie headers are refused.

#### Item fields

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `secret` | string | **yes** | pattern `^[A-Za-z][A-Za-z0-9_-]{0,63}$` |
| `host` | string | **yes** | 1–253 chars; pattern `^[a-z0-9]+(?:[.-][a-z0-9]+)*$` |
| `header` | string | **yes** | pattern `^[A-Za-z][A-Za-z0-9-]{0,63}$` |
| `prefix` | string | no | ≤ 100 chars; pattern `^[^\u0000-\u001f\u007f]*$` |


### `agent`

object · optional

Access to the Somnia Agent with `host-default` models only. The host keeps provider keys, billing and quotas; the guest sees output text only.

#### Field table

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `models` | array | **yes** | 1–1 items |
| `reason` | string | **yes** | 20–280 chars; pattern `^[^<>\u0000-\u001f\u007f]+$` |

#### `models`

array · required · 1–1 items

items: `"host-default"` (constant)

#### `reason`

string · required · 20–280 chars; pattern `^[^<>\u0000-\u001f\u007f]+$`

### `clipboardRead`

object · optional

Reading the clipboard requires a reason and a runtime prompt.

#### Field table

| Field | Type | Required | Limits |
| ----- | ---- | -------- | ------ |
| `reason` | string | **yes** | 20–280 chars; pattern `^[^<>\u0000-\u001f\u007f]+$` |

#### `reason`

string · required · 20–280 chars; pattern `^[^<>\u0000-\u001f\u007f]+$`

### `clipboardWrite`

boolean · optional

Writing the clipboard. Declared but not prompted.

## Related

- [Manifest and package contract](./manifest-and-package.md) — validation rules, budgets, ZIP preflight
- [Permissions and consent](./permissions-security.md) — what the `security` declarations drive
- [Error codes](./error-codes.md) — every `SOM-EXT-nnn` diagnostic
- [Versioning and compatibility](./developer-guide.md#11-versioning-and-compatibility)
