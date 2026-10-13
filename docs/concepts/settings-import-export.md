# Settings import and export

Status: concept only. Research checked 2026-10-13. No implementation or release.

## Recommendation

Expand the existing settings and shortcut transfer into one local, readable setup
file. Users can transfer their setup or share a subset without copying storage,
credentials, documents or permissions. Start with manual export and reviewed
import. Keep folder sync separate. "All settings" means all registered transferable
preferences, not all app data. Unclassified fields are excluded and reported.

## Existing foundation

Inspected `origin/int/shell` at `0ba4839f4551eaf339f31a08485260c7e369a13f`:

- [`settingsExport.ts`](../../phase1/src/lib/settingsExport.ts) exports modified
  [`settingsRegistry.ts`](../../phase1/src/lib/settingsRegistry.ts) entries as
  `{app:"somnia",kind:"settings",version:1,settings:{...}}`. That registry covers
  only some Settings categories. The parser does not enforce `app` or `version`.
- [`ModifiedSettings.tsx`](../../phase1/src/components/ModifiedSettings.tsx) offers
  export/import without a diff. `importPatch` resets other modified registry values
  to defaults, so a partial import can reset values absent from the file.
- [`shortcutTransfer.ts`](../../phase1/src/lib/shortcutTransfer.ts) separately
  validates bounded shortcut JSON and known command IDs.
- [`syncFolder.ts`](../../phase1/src/lib/syncFolder.ts) and
  [`SYNC-FOLDER.md`](../SYNC-FOLDER.md) define `somnia-sync.json`, modified registry
  settings plus shortcuts, newer-wins conflicts, native folder selection, and
  sync on linking or "Sync now". Profiles do not exist yet.
- [`projectSettings.ts`](../../phase1/src/lib/projectSettings.ts) separates stored
  user values from project overrides in `.somnia/settings.json`; only eligible
  units, image-save and publish settings can be project-scoped.
- [`shellLayoutStore.ts`](../../phase1/src/store/shellLayoutStore.ts) has per-studio
  typed layouts and panel/width sanitization. Arbitrary JSON in
  [`panelStateStore.ts`](../../phase1/src/store/panelStateStore.ts) is not safe to
  export wholesale.
- [`agent/settings.ts`](../../phase1/src/lib/agent/settings.ts) separates persisted
  provider/model/prompts from API keys and session file access. "Non-secret" prompts
  can still contain private text.

These are source-code observations, not tested desktop behavior. Reuse these
foundations; do not create a competing settings store or duplicate transfer UI.

## Research and design lessons

| Product | Verified pattern | Somnia lesson |
| --- | --- | --- |
| VS Code Profiles [S1] | Named customization sets, local `.code-profile` export or gist sharing, profile creation on import, machine-specific settings omitted | Local portable file, category selection; named profiles later. No required login or automatic upload. |
| VS Code Settings Sync [S2] | Category/exclusion controls, per-OS shortcuts by default, conflict diff, backups; Stable/Insiders use separate sync services by default | Separate manual import from sync; explain conflicts, platform mapping and rollback. |
| Zed [S3, S4] | Global settings JSON, project overrides, separate keymap JSON; release-channel overrides are top-level keys, and Settings Editor changes apply across channels | Readable stable IDs, explicit scope/platform handling. No opaque storage-directory transfer. |
| Obsidian Sync [S5] | Selective vault configuration, community plugin lists opt in, device-local sync policy, alternate configuration folders for profiles; some changes require reload | Separate configuration from installation; keep destinations local; mark restart requirements. |
| Raycast transfer [S6] | Encrypted `.rayconfig`; import checklist leaves unchecked categories untouched; separate snippets/quicklinks JSON is unencrypted; general imports merge, AI chat-copy import is a destructive exception | Category selection and explicit merge/replace semantics. Do not include history/content simply because another tool does. |
| Raycast Cloud Sync [S7] | Credentials/passwords and some device-specific settings excluded; backup recommended before sync | Transfer preferences, not identity/access; snapshot before mutation. |

Zed's historical maintainer/community discussion [S8] highlights platform keymaps
and extension inventory as sync problems. Started in 2023, it is not evidence of
Zed's current roadmap or absence of built-in sync. The public all-settings URL and
repository configuration guide returned different presentations; use the official
repository guide for precedence, not an inferred current export feature.

## Goals and non-goals

Goals: device migration, private setup backup, safe shared appearance/shortcuts,
studio layouts, selective import, stable versioning and a coverage report.

V1 excludes cloud accounts, automatic uploads, scheduled exports, profile switching,
extension installation, executable tasks/scripts/macros, MCP/ACP provisioning,
project/document backup and secret migration. A setup is not a `.somnia` project,
an extension bundle or a security policy.

## Scope and defaults

The table describes export selection. Import always requires review and host-owned
allowlists, including categories selected by default.

| Category | Transferable contents | Default and restrictions |
| --- | --- | --- |
| General/editor/workflow | Language, formatting, editor/typography/canvas defaults, recovery preferences without data, eligible save/publish options | Selected. Stored user values, not effective project overrides. Highlight behavior changes such as overwrite-original. |
| Appearance/themes | Built-in theme/editor-theme IDs, accent, density, fonts, contrast, motion, glass preferences | Selected. Validate descriptors/colors; unavailable fonts fall back. No CSS/JS, binaries or remote assets. |
| Keybindings | Stable command-ID overrides, explicit unbinds, common `Mod` and optional platform overrides | Selected. Preview target OS and collisions. No arbitrary command IDs/arguments. |
| Studio layouts | Known panel order/visibility, active panels, rail pinning, split orientation/ratio, bounded widths | Selected. Fit target viewport. No open documents, selections, screen coordinates or document-keyed mode memory. Panel-local state requires typed adapters. |
| Channels/updates | Check cadence and stable/beta/alpha preference | Not selected. Never update/download/change installed build or disable signatures. Unsupported distribution options skipped. |
| Extensions | Catalog identity, compatible version and host-approved typed configuration | Not selected. Inventory separate from configs. No package, source/install URL, binary, enablement, permission/trust grant or automatic install. |
| AI preferences | Provider/model preference, optional custom instructions | Not selected. Separate private-text review. Imported prompts disabled. No endpoints, cloud consent, active-file permission, keys, discovery or inference. |
| Project overrides | Only project-eligible settings | Separate command and explicitly chosen open project. No project path in export; user import never writes project settings. |
| Profiles | Optional setup label in v1; named portable profiles later | No profile engine, project association, account identity or activity in v1. |
| Server/service setup | Relay URLs, provider/custom endpoints, MCP/ACP commands, git/hosting destinations | Excluded in v1. Can contain private hosts, credentials or execution behavior. Future reviewed descriptors must not connect/start anything. |
| Local state/content | Window position, recent files, sync path/metadata, account/avatar/activity, logs, caches, drafts, backups, history, documents, components | Excluded. Device data/content is not setup. |
| Secrets/security | Keys, tokens, passwords, cookies, server credentials, private keys, certificate/device/server fingerprints, trust pins, auth/consent and permission records | Never plaintext; excluded from v1 export/import/sync/preview/logging. |

Coverage report: category counts and omission reasons, not sensitive field names,
values or source paths. "Export all transferable settings" does not bypass optional
category review or include unclassified fields.

### Registry and adapters

Extend the current registry with stable ID, schema/type/range, scope/default,
portability, sensitivity, apply behavior, restart flag and transfer availability.
Sensitivity classes: public preference, private text, secret, device, executable.
Defaults are deny. Settings, shortcuts, layouts and extensions use typed adapters
into one pure transfer model; never enumerate and dump `localStorage`.

Extension schemas must be declarative, restricted and host-reviewed, with per-field
classification and no remote references/callbacks. A manifest cannot declare its
credentials safe. Unknown blobs and generic panel state are excluded. Pattern
redaction is defense in depth, not a substitute for classification. Free-form text
can contain secrets; ambiguous text stays excluded or gets explicit private-text
review. Do not promise perfect automatic secret detection.

## Format and versioning

Proposed filename: `my-setup.somnia-settings.json`. UTF-8 JSON, two-space indentation,
trailing newline, sorted object keys. No archive/comments in v1. Same parser and
planner on native/web. This is not a currently registered file association.

Core-only example using existing setting and command IDs:

```json
{
  "app": "somnia",
  "kind": "setup",
  "schemaVersion": 1,
  "scope": "user",
  "label": "Writing setup",
  "categories": {
    "settings": {
      "mode": "overrides",
      "values": {
        "editor.wrapLines": true,
        "workflow.units": "metric"
      }
    },
    "keybindings": {
      "common": { "project.save": "Mod+S" },
      "platforms": {}
    }
  }
}
```

- Required envelope: `app`, `kind`, `schemaVersion`, `scope`, `categories`. User and
  project scope distinct; reject mismatch. Optional producer version/platform is
  informational only, never authority. No hostname, username or device GUID.
- `schemaVersion` versions interchange, independent of app release, legacy file,
  sync envelope and extension schema. Maintain JSON Schema Draft 2020-12 [S9] and
  generated types. All references bundled; never fetch file-specified schemas.
- Closed typed categories, then semantic checks for known IDs, ranges, cross-field
  constraints, platform, sensitivity and capabilities. Schema alone is not safety.
- `mode:"overrides"` preserves explicit deviations. In Merge selected, absent values
  stay untouched. In Replace selected, approved omissions inherit target defaults.
  Warn about changed source/target defaults. A future `mode:"snapshot"` can include
  all classified portable values to reproduce source defaults, not all app state.
- Extension entries: identity, version compatibility, config schema version and
  allowed values. Layouts: known studio/panel/rail/split/size descriptors, no blobs.
- Proposed total limit: 1 MiB UTF-8 bytes, depth 16, 10,000 entries. Apply smaller
  domain bounds too: legacy settings 256 KiB, shortcuts 100 KB, AI prompts max 20,
  8,000 bytes each/16,000 total. Enforce bytes before parse, not string length only.
- Supported version: validate; visibly skip unknown entries without applying them.
  Malformed envelope fails. Newer unsupported schema blocks apply with an update
  explanation. Older supported versions migrate purely/sequentially in memory,
  then revalidate. Unsupported versions never write. Original file untouched.
- Legacy settings-v1, shortcuts-object and sync-v1 have narrow labeled adapters.
  Manual imports use preview/Merge selected, not implicit global reset. Missing
  legacy version/app allowed only through explicit legacy compatibility detection;
  unknown claimed version blocked. Never guess a new-format interpretation.
- Keep sync-v1 compatible until a separate migration. Reuse safe codecs and
  classification, not the manual UI policy. Optional/private and security-changing
  fields must not enter automatic sync merely because they are exportable.

## UX and commands

Primary surface: Settings > System > Import & export. Modified links there with a
modified-settings selection; remove duplicate transfer flows. Sync folder stays
separate and nearby. Search terms: backup, transfer, share setup, import, export,
profile. Existing rounded Settings style, localization, tooltips, focus and keyboard
navigation. No debug/status clutter or new default shortcut for rare actions.

Export flow: choose Share setup or Transfer my setup (same safe defaults, optional
private categories offered), category/per-entry checklist, compatibility/omission
report, human and JSON preview, native Save dialog/web download. Private text masked
until intentionally revealed. No upload or share action. Native success follows
confirmed write; web says "Download started" when completion is unobservable.

Opening/dropping a recognized file offers "Review setup import", never applies it
or changes the open project. Labels/text rendered escaped and inert.

Import flow:

1. Bounded read, detect/migrate/validate/classify in memory. No callbacks, network,
   command handlers, shells or IPC beyond selected file read. Cancel is a no-op.
2. Build a pure plan from a consistent target snapshot. Show format, label, scope,
   target OS, counts/warnings. Rows show stored current, incoming, proposed result,
   effective value/origin and Add/Change/Same/Reset/Conflict/Unavailable/Blocked.
   Explain a project override masking a user change; do not remove that override.
3. Default **Merge selected**: incoming selected present values overwrite matching
   target entries. Absent/unchecked values remain. Explicit unbind differs from
   omission. Arrays/layouts use domain semantics, not generic deep merge.
4. Separate **Replace selected**: reset omissions only within explicitly selected
   categories, preview all resets and acknowledge their count. Deselected rows stay
   untouched even inside a replacement category. Never reset unavailable, unknown,
   unclassified, security/device or unchecked values. No ambiguous "Import all".
5. Resolve shortcut collisions/reserved keys and missing commands by keeping,
   replacing, unbinding or skipping affected rows. Missing extensions cannot receive
   config until separately installed with normal permission review. No queued install.
   Imported prompts remain disabled, needing separate activation.
6. Recheck target revision before Apply. State/sync/project changes rebuild preview
   and require review again. Mark restart requirements, never restart, infer, connect,
   update or rewrite documents as an import side effect.
7. Create durable local pre-import snapshot, then typed transactional apply. Snapshot
   excludes secrets/document data. Backup/persistence failure stops apply. Partial
   platform failure rolls back every adapter; explain rollback failure honestly.
   Domains without tested transactional/rollback support remain blocked.
8. Summary: applied/skipped, restart requirements, Undo import. Proposed retention:
   latest 10 snapshots within 10 MiB, local private text removable in Settings.
   Restore uses preview/revision checks too and does not silently erase later edits.

When sync is linked, show that imported settings can reach the linked folder on the
next sync. Pause sync through planning/commit. Afterward offer a separate "Sync
imported setup" or keep it paused until resumed. No unseen disclosure/replication.
Undo explains existing sync copies. Newer-wins policy unchanged until separately
reviewed; manual import must not race with sync or expand its data scope.

| Proposed ID | Palette label | Action |
| --- | --- | --- |
| `settings.exportSetup` | Settings: Export setup... | Checklist/preview. |
| `settings.importSetup` | Settings: Import setup... | File picker/preview, no immediate apply. |
| `settings.restoreImportBackup` | Settings: Restore pre-import setup... | Snapshot picker/preview. |
| `settings.exportProjectOverrides` | Project: Export settings... | Explicit selected-project scope. |
| `settings.importProjectOverrides` | Project: Import settings... | Selected-project preview, conflict-safe write. |

These IDs are proposals, not existing APIs. All entry points route to the same flow.
CLI deferred; any future CLI defaults to dry-run and explicit scope/categories,
without bypassing consent, credentials or extension trust.

## Security requirements

Every file is untrusted, including a colleague's export. Valid structure is not
permission to execute or access anything.

- Never export keys, tokens, server credentials, fingerprints or other secrets in
  plaintext; no include-everything bypass. V1 secret transfer excluded. A future
  separate mode requires explicit per-secret consent, authenticated encryption,
  vetted libraries/key derivation, no plaintext temp files/logging and security
  review. Encryption alone does not authorize disclosure; trust/grants never migrate.
- Block duplicate keys, `__proto__`, `prototype`, `constructor`, unsuitable control
  characters/NUL/invalid Unicode, excessive depth/counts. Own-property checks and
  null-prototype maps. Enforce enums/ranges/cross-field checks; visibly exclude bad
  values and reject malformed envelopes.
- No eval, dynamic import, scripts/macros/tasks, CSS injection, theme binaries,
  packages, URL navigation, downloads, shell/MCP/ACP startup or network requests.
  Imported paths never choose destinations or grant access. No remote schema fetch.
- Exclude preferences that indirectly enable execution/access: preview-script
  enablement is excluded from v1 even though the legacy registry includes it.
  Extension callbacks never execute during preview; later reload follows existing
  consent gates. Importing configuration cannot enable an extension.
- No accounts/licenses/subscriptions, identity, source trust, granted/revoked
  permissions, cloud consent, active-file access or security suppression. A file
  cannot certify itself trusted via a signature field.
- AI prompts may contain malicious instructions/private facts. They are reviewed
  content, not importer instructions; disabled until separate activation. No prompt
  text in logs/errors. Generic strings cannot guarantee absence of secrets.
- Project writes use the normal selected-project file layer and dirty/conflict
  checks, never file-supplied paths. Cannot weaken close/save data-loss protection.
- Log format/version/counts/outcome only. Labels bounded/escaped, values/credentials/
  hosts/paths scrubbed. Never attach rejected files to crash reports; no secret
  fingerprints/checksums in exports or logs.

## Effort and delivery slices

Planning estimates, not promises. One experienced engineer familiar with Somnia;
focused tests/review included, integration and owner-device checks may change ranges.

| Stage | Work | Engineering days |
| --- | --- | --- |
| Inventory/contract | Audit all Settings domains; classify; schema/legacy migration | 3-5 |
| Safe core | Export/parser/planner, limits, adapters, merge/replace, rollback | 4-6 |
| UX/commands | Checklist/diff, conflicts, localization/A11y, sync interlock | 4-6 |
| Verification | Appearance/layout/channel coverage, hostile inputs, native/web | 3-5 |

Core v1: 14-22 days. Typed extension contracts plus optional AI/private-text transfer:
roughly 4-7 additional days. Named profiles: roughly 5-10 days after separate design.
Secret transfer unestimated/excluded. Start safe preferences/shortcuts, then portable
appearance/layouts and optional channel policy, then SDK-reviewed extension configs.
Do not promise every panel or extension blob is transferable before adapter review.

## Acceptance tests

- Every Settings category audited; adapter or explicit exclusion. New unclassified
  settings fail coverage tests. Deterministic export, safe round trips, truthful omissions.
- Partial Merge selected leaves absent/unchecked values untouched. Replace selected
  applies only reviewed resets. Unknown/unavailable values never cause resets.
- Legacy settings/shortcuts/sync fixtures pass manual preview without old reset
  semantics; sync-v1 remains compatible. Empty/corrupt/newer files never write.
- Windows/macOS/Linux shortcut mapping/collisions, fonts, missing studios/panels/
  themes/extensions and Store restrictions preview safely without installs/downloads.
- Nested/mislabeled secrets, hosts/fingerprints, paths, grants, content and script
  enablement excluded. Malicious labels, duplicate/dangerous keys, deep/oversized
  UTF-8, remote schemas, invalid ranges/versions cause no execution/network.
- Cancel no-op, stale revision re-review, dirty project conflict checks, snapshot/
  write/adapter/rollback failures, restore preserving unrelated later changes.
- Sync paused/interlocked; optional private categories never leak into folder sync.
- Light/dark/high-contrast and narrow Settings, keyboard/screen-reader tests. Native
  dialogs/permissions/rollback and owner Windows validation before desktop claims.

## Decisions before development

Recommended defaults, not approvals: confirm secret/executable/server/profile
exclusions; filename and Merge selected default; optional AI/extension first-slice
scope; local backup retention/budget; and whether linked sync stays paused until
explicitly resumed after import (recommended).

## Sources

Fetched 2026-10-13. Product pages generally undated. Official documentation for
current behavior, historical community context and primary specification. Proposed
Somnia behavior is not an existing feature; no external source code copied.

- [S1] Microsoft, Profiles: https://code.visualstudio.com/docs/configure/profiles
- [S2] Microsoft, Settings Sync: https://code.visualstudio.com/docs/configure/settings-sync
- [S3] Zed official repository guide: https://github.com/zed-industries/zed/blob/main/docs/src/configuring-zed.md
- [S4] Zed Keybindings: https://zed.dev/docs/key-bindings
- [S5] Obsidian selective/configuration sync: https://obsidian.md/help/sync/settings
- [S6] Raycast Import & Export: https://manual.raycast.com/import-export
- [S7] Raycast Cloud Sync: https://manual.raycast.com/cloud-sync
- [S8] Zed historical discussion #6569 (started 2023-02-14): https://github.com/zed-industries/zed/discussions/6569
- [S9] JSON Schema Draft 2020-12 Validation: https://json-schema.org/draft/2020-12/json-schema-validation

Roadmap-Delta: Expand existing settings/shortcut JSON transfer into classified,
versioned portable setup with selective merge/replace, preview/rollback, themes,
studio layouts and opt-in channel/extension config; keep sync compatibility and
secrets, execution and trust grants out of v1.
