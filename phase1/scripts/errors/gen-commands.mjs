#!/usr/bin/env node
// Generates the command manifest (docs/errors/commands.json) and phase1/src/generated/commandNames.ts
// from the Tauri invoke_handler plus the PLANNED list (commands whose Rust side lands with their package).
// Usage: node scripts/errors/gen-commands.mjs [--check]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const phase1 = resolve(here, '../..');
const repo = resolve(phase1, '..');
const srcDir = join(phase1, 'src-tauri/src');
const MANIFEST = join(repo, 'docs/errors/commands.json');
const NAMES_TS = join(phase1, 'src/generated/commandNames.ts');

// Native handlers that already return AppCommandError through cmd() (wrapped from day 1).
const WRAPPED = new Map([
  ['drain_open_requests', 'B7'], ['claim_open_request', 'B7'], ['read_by_grant', 'B7'], ['ack_open_request', 'B7'],
  ['release_candidate', 'B7'], ['retry_open_item', 'B7'], ['get_intake_policy', 'B7'], ['set_intake_policy', 'B7'],
  ['build_diagnostic_zip', 'B1'], ['write_diagnostic_zip', 'B1'], ['discard_diagnostic_snapshot', 'B1'],
  ['list_crash_reports', 'B1'], ['mark_crash_reports_reviewed', 'B1'], ['delete_crash_reports', 'B1'],
  ['record_frontend_fatal', 'B1'],
]);

// Parameters injected by Tauri (never part of the JS call).
const INJECTED = /^(tauri::)?(WebviewWindow|Window|AppHandle|State\b|Webview\b)|^State</;
// Raw binary request body: JS passes the payload (+ headers), not named args.
const RAW = /tauri::ipc::Request/;

/** Planned commands (design D1/D2/D3, errata applied). params are Rust snake_case names. */
export const PLANNED = [
];

const DOMAIN_RULES = [
  [/^(drain_open_requests|claim_open_request|read_by_grant|ack_open_request|release_candidate|retry_open_item|get_intake_policy|set_intake_policy)$/, 'intake'],
  [/^(build_diagnostic_zip|write_diagnostic_zip|discard_diagnostic_snapshot|list_crash_reports|mark_crash_reports_reviewed|delete_crash_reports|record_frontend_fatal)$/, 'diagnostics'],
  [/^git_/, 'git'],
  [/^(agent_account_|github_account_)/, 'auth'],
  [/^(agent_settings_|agent_key_|mcp_|studio_mcp_)/, 'agent'],
  [/^(ext_|extension_activity_)/, 'ext'],
  [/^(provider_http_|collab_lan_)/, 'net'],
  [/^(selftest_|log_|set_window_background|open_external|is_store_package|open_startup_file)/, 'app'],
  [/.*/, 'fs'],
];
const domainOf = (n) => DOMAIN_RULES.find(([re]) => re.test(n))[1];
const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function splitTop(s) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if ('<([{'.includes(ch)) depth++;
    if ('>)]}'.includes(ch) && !(ch === '>' && cur.endsWith('-'))) depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function handlerNames() {
  const text = readFileSync(join(srcDir, 'desktop.rs'), 'utf8');
  const m = text.match(/generate_handler!\[([\s\S]*?)\]\)/);
  if (!m) throw new Error('generate_handler! not found in desktop.rs');
  return m[1].split(',').map((x) => x.trim().split('::').pop()).filter(Boolean);
}

function nativeSignatures() {
  const sigs = new Map();
  for (const f of readdirSync(srcDir).filter((x) => x.endsWith('.rs'))) {
    const text = readFileSync(join(srcDir, f), 'utf8');
    const re = /#\[tauri::command\][^]*?(?:pub\s+)?(?:async\s+)?fn\s+([a-z0-9_]+)\s*(?:<[^>]*>)?\s*\(([^]*?)\)\s*(?:->|\{)/g;
    for (const m of text.matchAll(re)) {
      const params = splitTop(m[2]).map((p) => {
        const i = p.indexOf(':');
        return { name: p.slice(0, i).trim().replace(/^mut\s+/, ''), type: p.slice(i + 1).trim() };
      });
      sigs.set(m[1], { file: f, params });
    }
  }
  return sigs;
}

export function build() {
  const sigs = nativeSignatures();
  const entries = [];
  for (const name of handlerNames()) {
    const sig = sigs.get(name);
    if (!sig) throw new Error(`no #[tauri::command] fn found for handler ${name}`);
    const raw = sig.params.some((p) => RAW.test(p.type));
    const params = sig.params.filter((p) => !INJECTED.test(p.type) && !RAW.test(p.type)).map((p) => p.name);
    entries.push({ name, domain: domainOf(name), status: 'native', wrapped: WRAPPED.has(name), boundary: WRAPPED.get(name) ?? 'B1',
      params, args: params.map(camel), ...(raw ? { raw: true } : {}) });
  }
  for (const p of PLANNED) {
    entries.push({ name: p.name, domain: p.domain, status: 'planned', wrapped: true, boundary: p.boundary,
      params: p.params, args: p.params.map(camel) });
  }
  const names = new Set();
  for (const e of entries) { if (names.has(e.name)) throw new Error(`duplicate command ${e.name}`); names.add(e.name); }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

export function render(entries) {
  const manifest = JSON.stringify({ schema: 1, note: 'Generated by phase1/scripts/errors/gen-commands.mjs. Do not edit.', commands: entries }, null, 2) + '\n';
  const names = [
    '// Generated by scripts/errors/gen-commands.mjs from docs/errors/commands.json. Do not edit.',
    'export const COMMAND_NAMES = [',
    ...entries.map((e) => `  '${e.name}',`),
    '] as const;',
    'export type CommandName = (typeof COMMAND_NAMES)[number];',
    '',
    '/** Camel-case JS argument keys per command (Tauri maps Rust snake_case params to camelCase). */',
    'export const COMMAND_ARGS: Readonly<Record<CommandName, readonly string[]>> = {',
    ...entries.map((e) => `  ${e.name}: [${e.args.map((a) => `'${a}'`).join(', ')}],`),
    '};',
    '',
    'export const COMMAND_META: Readonly<Record<CommandName, { domain: string; wrapped: boolean; raw: boolean; boundary: string }>> = {',
    ...entries.map((e) => `  ${e.name}: { domain: '${e.domain}', wrapped: ${e.wrapped}, raw: ${!!e.raw}, boundary: '${e.boundary}' },`),
    '};',
    '',
  ].join('\n');
  return { manifest, names };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { manifest, names } = render(build());
  if (process.argv.includes('--check')) {
    const stale = [[MANIFEST, manifest], [NAMES_TS, names]].filter(([f, c]) => !existsSync(f) || readFileSync(f, 'utf8') !== c);
    if (stale.length) { console.error('Command manifest is stale. Run: node scripts/errors/gen-commands.mjs\n' + stale.map(([f]) => ' - ' + f).join('\n')); process.exit(1); }
    console.log('Command manifest is up to date.');
  } else {
    writeFileSync(MANIFEST, manifest); writeFileSync(NAMES_TS, names);
    console.log(`Wrote ${MANIFEST} and ${NAMES_TS}`);
  }
}
