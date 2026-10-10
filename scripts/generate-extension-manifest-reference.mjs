#!/usr/bin/env node
/**
 * Generates docs/extensions/v2/manifest-reference.md from the SDK v2 manifest
 * schema (the single source of truth). Never hand-edit the generated page:
 * edit this generator or the schema, then re-run:
 *
 *   node scripts/generate-extension-manifest-reference.mjs          # write
 *   node scripts/generate-extension-manifest-reference.mjs --check  # CI gate
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join, dirname} from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = 'phase1/src/lib/extensions/contracts/v2/manifest.schema.json';
const OUT_PATH = 'docs/extensions/v2/manifest-reference.md';
const schema = JSON.parse(readFileSync(join(root, SCHEMA_PATH), 'utf8'));

/** Curated prose per field path. Schema constraints are rendered mechanically;
 *  this map carries the explanations the schema cannot express. */
const DOCS = {
  '$schema': 'Editor hint pointing at a copy of the schema. Tools never fetch it.',
  'manifestVersion': 'Manifest contract version. SDK v2 manifests always use `2`.',
  'id': 'Globally unique extension ID: `publisher.name`, lowercase with dashes. The first segment must equal `publisher`.',
  'publisher': 'Your publisher namespace. Every command ID starts with this segment.',
  'name': 'Display name shown in Settings and the index.',
  'version': 'Stable SemVer (`major.minor.patch`, optional `+build`). No prerelease tags in packages.',
  'description': 'One or two plain sentences. Shown on the extension card and the install review.',
  'license': 'An SPDX expression such as `MIT`, or `SEE LICENSE IN <path>` naming a file inside the package.',
  'engines': 'Host versions this package runs on. Both ranges are checked at enablement.',
  'engines.somnia': 'Somnia app range. Explicit lower bound and exclusive upper major: `">=11.0.0 <12.0.0"`. Wildcards and tags are rejected.',
  'engines.api': 'SDK API range. Must stay inside major 2: `">=2.0.0 <3.0.0"`.',
  'runtime': 'How this package executes. Exactly one variant.',
  'runtime.declarative': 'No code. Themes, snippets and declarative panels only. Commands are rejected on a declarative runtime.',
  'runtime.wasm': 'A WebAssembly entry running in the isolated worker with the `somnia-json-1` ABI. The only executable lane browser targets advertise today.',
  'runtime.js': 'A bundled single-file JavaScript entry. Runs on targets that advertise the `js` runtime; check `HostCapabilities.runtimes` and handle `E_INCOMPATIBLE_API`.',
  'runtime.wasm.entry': 'Package-relative path to the `.wasm` entry.',
  'runtime.wasm.abi': 'Wasm ABI contract. Currently always `"somnia-json-1"`.',
  'runtime.js.entry': 'Package-relative path to the bundled `.js` entry. Bundles must be self-contained; there is no package manager at install time.',
  'activationEvents': 'Events that start the runtime. Every command and panel needs a matching `onCommand:` / `onPanel:` event unless you activate on startup. Store packages may not use `*`.',
  'permissions': 'Capability strings the install review shows to the user. Ask for the minimum; users can revoke each one per extension.',
  'capabilities': 'Behaviour in restricted environments. Both tables are required.',
  'capabilities.untrustedWorkspaces': 'Whether the extension runs when the user marks a project untrusted. `limited` needs a `description` and an `allowedPermissions` subset of `permissions`.',
  'capabilities.virtualWorkspaces': 'Whether the extension runs when the project has no real folder on disk.',
  'contributes': 'Everything the extension adds to Somnia. Declarative first: the host registers these before any code runs. Unknown keys here are errors.',
  'contributes.commands': 'Commands in the palette and menus. IDs are `publisher.name.thing`. A command needs the `commands` permission, an executable runtime and a matching `onCommand:` activation event.',
  'contributes.commands[].id': 'Three-segment ID inside your namespace, e.g. `acme.word-count.count`.',
  'contributes.commands[].title': 'Verb-first title shown in the command palette.',
  'contributes.commands[].category': 'Menu group the command appears under.',
  'contributes.commands[].icon': 'Optional package-relative icon asset.',
  'contributes.commands[].when': 'Context expression gating availability. Closed boolean grammar over `studio`, `language`, `hasProject`, `hasSelection`, `workspaceTrusted`, `isReadonly` — never JavaScript.',
  'contributes.commands[].argumentsSchema': 'Closed JSON Schema subset for command arguments: no references, no patterns, no arbitrary keywords, at most 8 levels deep.',
  'contributes.commands[].resultSchema': 'Closed JSON Schema subset for the command result, same rules as `argumentsSchema`.',
  'contributes.panels': 'Side-rail panels. `declarative` panels are native view trees; `webview` panels render through the isolated panel bridge, never inside Somnia’s own UI tree.',
  'contributes.panels[].id': 'Panel ID, unique inside the extension. Activation uses `onPanel:<extId>.<panelId>`.',
  'contributes.panels[].title': 'Panel title shown in the rail tooltip and header.',
  'contributes.panels[].side': 'Which side rail hosts the panel.',
  'contributes.panels[].kind': '`declarative` for a native view tree, `webview` for an isolated HTML surface.',
  'contributes.panels[].path': 'Package-relative panel asset: view-tree JSON for `declarative`, HTML for `webview`. Budget 256 KiB.',
  'contributes.panels[].icon': 'Optional package-relative rail icon.',
  'contributes.panels[].when': 'Context expression gating visibility, same grammar as commands.',
  'contributes.panels[].studios': 'Studios the panel appears in. Omit to show in every studio.',
  'contributes.panels[].scripts': 'Webview panels only: whether the page may run its own scripts. Declarative panels must keep this `false`.',
  'contributes.themes': 'Syntax (`code`) or interface (`ui`) themes. Theme assets are limited to 64 KiB.',
  'contributes.themes[].id': 'Theme ID, unique inside the extension.',
  'contributes.themes[].label': 'Name shown in the theme picker.',
  'contributes.themes[].kind': '`code` for editor syntax colours, `ui` for the interface.',
  'contributes.themes[].mode': 'Light or dark base mode.',
  'contributes.themes[].path': 'Package-relative theme JSON asset.',
  'contributes.snippets': 'Snippet sets per language. Snippet assets are limited to 32 KiB.',
  'contributes.snippets[].id': 'Snippet-set ID, unique inside the extension.',
  'contributes.snippets[].label': 'Name shown in the snippet picker.',
  'contributes.snippets[].language': 'Language the set applies to, e.g. `html`.',
  'contributes.snippets[].path': 'Package-relative snippet JSON asset.',
  'contributes.snippets[].prefix': 'Optional default trigger prefix.',
  'contributes.snippets[].description': 'What the set contains.',
  'contributes.snippets[].studios': 'Studios the snippets apply to. Omit for every studio.',
  'dependencies': 'Inventory of bundled third-party code: exact versions, licenses and `sha256:` source integrity. The inventory documents provenance; it is not by itself proof of it.',
  'proposedApis': 'Experimental API revisions this package needs. Only the `experimental` lane accepts these.',
  'repository': 'HTTPS source URL, no embedded credentials.',
  'homepage': 'HTTPS product page URL, no embedded credentials.',
  'icon': 'Package-relative icon shown on cards, the detail page and the install review.',
  'security': 'Optional expanded consent declarations. Omitting it means tier A with no filesystem, network, secrets, clipboard or agent rights. See `permissions-security.md` for the consent engine these declarations drive.',
  'security.tier': '`A`: sandboxed, the default. `B`: native full trust — manual `.somniax` installs with Developer Mode only; Store validation rejects it.',
  'security.fs': 'Filesystem scope beyond the open project. `none`, `project` or `ask` (per-target runtime consent). Reads are capped at 512 KiB, writes at 1 MiB, writes are atomic.',
  'security.network': 'Exact HTTPS hosts the extension may call. Unique lowercase DNS names, no wildcards or ports. `paths` are case-sensitive prefixes with one optional trailing `*`; omit `paths` to cover the whole host. Every entry needs a plain-text `reason` (20–280 characters) shown at install review.',
  'security.secrets': 'Secret slot names the extension uses. Users fill slots in Settings; extension code never reads values.',
  'security.inject': 'Header injection rules: one declared secret into one declared host. Transport and cookie headers are refused.',
  'security.agent': 'Access to the Somnia Agent with `host-default` models only. The host keeps provider keys, billing and quotas; the guest sees output text only.',
  'security.clipboardRead': 'Reading the clipboard requires a reason and a runtime prompt.',
  'security.clipboardWrite': 'Writing the clipboard. Declared but not prompted.',
};

const FULL_EXAMPLE = String.raw`"$schema" = "./somnia-extension-v2.schema.json"
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
`;

function typeOf(node) {
  if (node.oneOf && !node.type) return `one of ${node.oneOf.length} variants`;
  if (node.const !== undefined) return `\`${JSON.stringify(node.const)}\` (constant)`;
  if (node.enum) return node.enum.map(v => `\`${JSON.stringify(v)}\``).join(' | ');
  if (node.type === 'array') return 'array';
  if (node.type === 'object') return 'object';
  if (node.type === 'integer') return 'integer';
  if (node.type === 'boolean') return 'boolean';
  return 'string';
}
function limits(node) {
  const out = [];
  if (node.minLength !== undefined && node.maxLength !== undefined) out.push(`${node.minLength}–${node.maxLength} chars`);
  else if (node.maxLength !== undefined) out.push(`≤ ${node.maxLength} chars`);
  else if (node.minLength) out.push(`≥ ${node.minLength} chars`);
  if (node.minItems !== undefined || node.maxItems !== undefined) out.push(`${node.minItems ?? 0}–${node.maxItems ?? '∞'} items`);
  if (node.uniqueItems) out.push('unique items');
  if (node.maxProperties !== undefined) out.push(`≤ ${node.maxProperties} properties`);
  if (node.pattern) out.push(`pattern \`${node.pattern}\``);
  if (node.default !== undefined) out.push(`default \`${JSON.stringify(node.default)}\``);
  return out.join('; ');
}
function doc(path) { return DOCS[path] ?? schema_description(path); }
function schema_description() { return ''; }

const lines = [];
lines.push('# SDK v2 manifest reference');
lines.push('');
lines.push('> **Generated — do not edit.** Source of truth:');
lines.push(`> \`${SCHEMA_PATH}\` (JSON Schema 2020-12 over the parsed TOML data model).`);
lines.push('> Regenerate with `node scripts/generate-extension-manifest-reference.mjs`; CI fails this page on drift.');
lines.push('');
lines.push('Applies to: SDK API v2 (`manifestVersion = 2`, `engines.api` inside major 2).');
lines.push('');
lines.push('Every v2 package is a `.somniax` ZIP with exactly one root `somnia-extension.toml`.');
lines.push('The schema is **closed at every level**: unknown keys are errors, not warnings. This');
lines.push('surprises authors from other ecosystems, so it is stated here once and enforced by');
lines.push('`SOM-EXT-002` everywhere. All diagnostics carry an RFC 6901 JSON pointer into the');
lines.push('parsed manifest; see [Error codes](./error-codes.md). Semantic rules the schema');
lines.push('cannot express (namespace equality, engine bounds, activation correspondence,');
lines.push('license expressions, security declaration checks) run in the same validator and are');
lines.push('listed under each field.');
lines.push('');
lines.push('## Fields at a glance');
lines.push('');
lines.push('| Field | Type | Required | Rule |');
lines.push('| ----- | ---- | -------- | ---- |');
for (const [key, node] of Object.entries(schema.properties)) {
  const req = (schema.required ?? []).includes(key);
  const rule = (DOCS[key] ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  lines.push(`| [\`${key}\`](#${key.toLowerCase().replace(/[^a-z0-9]/g, '')}) | ${typeOf(node)} | ${req ? '**yes**' : 'no'} | ${rule} |`);
}
lines.push('');
lines.push('## Full example');
lines.push('');
lines.push('A complete, valid `somnia-extension.toml`. CI validates this block against the real');
lines.push('parser on every change.');
lines.push('');
lines.push('```toml');
lines.push(FULL_EXAMPLE.trimEnd());
lines.push('```');
lines.push('');

function renderObject(path, node, headingLevel) {
  const props = node.properties ?? {};
  const req = new Set(node.required ?? []);
  if (Object.keys(props).length) {
    lines.push(`${'#'.repeat(headingLevel)} Field table`);
    lines.push('');
    lines.push('| Field | Type | Required | Limits |');
    lines.push('| ----- | ---- | -------- | ------ |');
    for (const [k, v] of Object.entries(props)) {
      lines.push(`| \`${k}\` | ${typeOf(v).replace(/\|/g, '\\|')} | ${req.has(k) ? '**yes**' : 'no'} | ${limits(v).replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  for (const [k, v] of Object.entries(props)) {
    const childPath = path ? `${path}.${k}` : k;
    lines.push(`${'#'.repeat(headingLevel)} \`${k}\``);
    lines.push('');
    lines.push(`${typeOf(v)} · ${req.has(k) ? 'required' : 'optional'}${limits(v) ? ` · ${limits(v)}` : ''}`);
    lines.push('');
    const prose = DOCS[childPath];
    if (prose) { lines.push(prose); lines.push(''); }
    renderNode(childPath, v, headingLevel + 1);
  }
}
function renderNode(path, node, headingLevel) {
  if (node.oneOf) {
    lines.push(`${'#'.repeat(headingLevel)} Variants`);
    lines.push('');
    for (const variant of node.oneOf) {
      const label = variant.properties?.type?.const ?? variant.properties?.supported?.const ?? ((variant.properties?.supported?.enum ?? []).join(' / ') || 'variant');
      const vprose = DOCS[`${path}.${label}`];
      lines.push(`- **\`${label}\`**${vprose ? ` — ${vprose}` : ''}`);
      for (const [k, v] of Object.entries(variant.properties ?? {})) {
        const vp = `${path}.${label}`;
        const reqV = (variant.required ?? []).includes(k);
        const prose = DOCS[`${vp}.${k}`] ?? DOCS[`${path}.${k}`] ?? '';
        lines.push(`  - \`${k}\` — ${typeOf(v)}, ${reqV ? 'required' : 'optional'}${limits(v) ? `, ${limits(v)}` : ''}${prose ? `. ${prose}` : '.'}`);
      }
    }
    lines.push('');
    return;
  }
  if (node.type === 'array' && node.items && node.items.type === 'object') {
    lines.push(`${'#'.repeat(headingLevel)} Item fields`);
    lines.push('');
    const itemNode = node.items;
    const req = new Set(itemNode.required ?? []);
    lines.push('| Field | Type | Required | Limits |');
    lines.push('| ----- | ---- | -------- | ------ |');
    for (const [k, v] of Object.entries(itemNode.properties ?? {})) {
      lines.push(`| \`${k}\` | ${typeOf(v).replace(/\|/g, '\\|')} | ${req.has(k) ? '**yes**' : 'no'} | ${limits(v).replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
    for (const [k, v] of Object.entries(itemNode.properties ?? {})) {
      const prose = DOCS[`${path}[].${k}`];
      if (!prose) continue;
      lines.push(`- **\`${k}\`** — ${prose}`);
    }
    lines.push('');
    return;
  }
  if (node.type === 'array' && node.items) {
    const it = node.items;
    const bits = [`items: ${typeOf(it)}`];
    const l = limits(it);
    if (l) bits.push(l);
    lines.push(bits.join(' · '));
    lines.push('');
    return;
  }
  if (node.type === 'object' && node.properties) {
    renderObject(path, node, headingLevel);
  }
}

for (const [key, node] of Object.entries(schema.properties)) {
  lines.push(`## ${key}`);
  lines.push('');
  const req = (schema.required ?? []).includes(key);
  lines.push(`${typeOf(node)} · ${req ? 'required' : 'optional'}${limits(node) ? ` · ${limits(node)}` : ''}`);
  lines.push('');
  if (DOCS[key]) { lines.push(DOCS[key]); lines.push(''); }
  renderNode(key, node, 3);
}
lines.push('## Related');
lines.push('');
lines.push('- [Manifest and package contract](./manifest-and-package.md) — validation rules, budgets, ZIP preflight');
lines.push('- [Permissions and consent](./permissions-security.md) — what the `security` declarations drive');
lines.push('- [Error codes](./error-codes.md) — every `SOM-EXT-nnn` diagnostic');
lines.push('- [Versioning and compatibility](./developer-guide.md#11-versioning-and-compatibility)');
lines.push('');

const output = lines.join('\n');
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(join(root, OUT_PATH), 'utf8'); } catch { /* missing */ }
  if (current !== output) {
    console.error(`error: ${OUT_PATH} is out of date. Run: node scripts/generate-extension-manifest-reference.mjs`);
    process.exit(1);
  }
  console.log(`ok: ${OUT_PATH} matches the schema.`);
} else {
  writeFileSync(join(root, OUT_PATH), output);
  console.log(`wrote ${OUT_PATH}`);
}
