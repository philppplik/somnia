import {registerStudio3DCommands} from '../src/lib/studio3d/commands';
import {agentCommandReadiness} from '../src/lib/agent/commandReadiness';
import {registerInterfaceCommands} from '../src/lib/interface/commands';
import {registerDocumentPanelCommands} from '../src/lib/documents/panelCommands';
import {registerCodePanelCommands} from '../src/lib/codePanels/commands';
import {registerDeployPanelCommands} from '../src/lib/deployPanels/commands';import {registerWorkspaceCommands} from '../src/store/workspaceCommands';
/**
 * UI command inventory (engine-hardening plan, steps 1.1 and 1.7) and the gate for
 * `npm run check:ui-commands`.
 *
 * Imports the static registration modules, runs the mount-time registrations of the
 * studios (vector, sheets, slides, design, pdfedit, raster) and dumps the registry to
 * docs/ui-commands.json plus a readable docs/ui-commands.md. `--check` fails when
 *  - the committed inventory drifted from the registry, or
 *  - a command has no title or no `cmd.<id>` key in every locale catalogue.
 * Truly runtime-only sources are declared in DYNAMIC_SOURCES and printed in the markdown.
 *
 * `tsx scripts/dump-ui-commands.ts` writes both files.
 * This is NOT `check:commands` - that one guards the Tauri IPC manifest and stays untouched.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import '../src/lib/commands';
import '../src/lib/collab/commands';
import '../src/store/railCommands';
import {registerDeployCommands} from '../src/lib/deploy/register';
import {createTauriDeployBackend} from '../src/lib/deploy/tauriBackend';
import { listCommands } from '../src/lib/commands';
import { CATALOGUES, t } from '../src/lib/i18n';
import { commandDispatcher, CommandDispatcher } from '../src/lib/commandDispatcher';
import { vectorCommandsReady } from '../src/store/vectorBootstrap';
import { registerSheetsCommands } from '../src/lib/sheets/commands';
import {registerSoundCommands} from '../src/lib/sound/commands';
import { registerDocumentsCommands } from '../src/lib/documents/commands';
import { registerSlidesCommands } from '../src/lib/slides/commands';
import { registerHandoffCommands } from '../src/lib/handoff/commands';
import { registerDesignCommands } from '../src/lib/design/commands';
import { pdfCommandSpecs } from '../src/lib/pdfedit/commands';
import { registerAnimationCommands } from '../src/lib/animation/commands';
import { registerCommandSpec } from '../src/lib/commandBridge';
import { registerPhotosCommands } from '../src/lib/photos/panelCommands';
import { registerRasterCommands, type RasterCommandActions } from '../src/lib/photos/rasterCommands';

interface Entry {
  id: string;
  title: string;
  category: string;
  source: string;
  shortcut?: string;
  keywords?: string[];
  allowInInput?: boolean;
  hasEnabled: boolean;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, '..', 'docs', 'ui-commands.json');
const mdPath = join(root, '..', 'docs', 'ui-commands.md');

/**
 * Sources that register when their studio mounts. Each is wired here so the inventory
 * and the gate see them; a new mount-time source must be added to this list.
 */
const pdfStub = {
  name: 'inventory', getSession: () => null, exportCopy: async () => undefined,
  rotate: async () => undefined, history: async () => undefined,
};
const rasterStub = new Proxy({}, { get: () => () => undefined }) as unknown as RasterCommandActions;

/** Ids owned by a mount-time source, recorded by diffing the registry around each registration. */
const sourceOf = new Map<string, string>();
registerCodePanelCommands({ready:()=>true,reveal:()=>{},attribute:()=>{},width:()=>{}});
registerDeployPanelCommands({available:()=>true,show:()=>{},select:()=>true,dryRun:async()=>null,setDomain:async()=>true});
const known = () => new Set(listCommands().map(c => c.id));
async function withSource(source: string, register: () => unknown): Promise<void> {
  const before = known();
  await register();
  for (const id of known()) if (!before.has(id)) sourceOf.set(id, source);
}

/**
 * Runtime-only sources that cannot be enumerated statically. They are declared (and
 * listed in docs/ui-commands.md) and exempt from the key check because their titles come
 * from data: `recovery.restore.<path>` (fileAdapter, one per recovery file) and
 * extension commands/snippets (extensions/host.ts, titles from the extension manifest).
 * Sound's `sound_inspect` / `sound_propose_settings` specs live in a host-bound private
 * dispatcher (agent/soundStudio.ts), never in the palette registry, so they are not UI commands.
 */
export const DYNAMIC_SOURCES = [
  { source: 'fileAdapter', pattern: 'recovery.restore.<path>', why: 'one entry per recovery file of the open project' },
  { source: 'extensions', pattern: 'ext.<extension>.<command>', why: 'titles come from the extension manifest' },
  { source: 'sound', pattern: 'sound_inspect, sound_propose_settings', why: 'bound to the live Sound host, agent-only dispatcher, not in the palette' },
] as const;

const LOCALES = Object.keys(CATALOGUES);

/** Commands that miss a title or a `cmd.<id>` key in any locale. Returns human-readable problems. */
export function keyProblems(commands: Entry[]): string[] {
  const out: string[] = [];
  for (const c of commands) {
    if (!c.title.trim()) out.push(`${c.id}: empty title`);
    const missing = LOCALES.filter(l => !CATALOGUES[l]?.[`cmd.${c.id}`]);
    if (missing.length) out.push(`${c.id}: no cmd.${c.id} key in ${missing.join(', ')}`);
  }
  return out;
}

export async function collect(): Promise<Entry[]> {
  await withSource('workspace',()=>registerWorkspaceCommands());
  await withSource('vector', () => vectorCommandsReady);
  await withSource('sheets', () => registerSheetsCommands());
  await withSource('sound', () => registerSoundCommands());
  await withSource('documents', () => registerDocumentsCommands());
  await withSource('documents-panels', () => registerDocumentPanelCommands());
  await withSource('slides', () => registerSlidesCommands());
  await withSource('slides', () => registerHandoffCommands());
  await withSource('design', () => registerDesignCommands());
  await withSource('interface', () => registerInterfaceCommands());
  await withSource('photos', () => registerPhotosCommands());
  await withSource('pdfedit', () => { for (const spec of pdfCommandSpecs(pdfStub)) registerCommandSpec(spec); });
  await withSource('studio3d',()=>registerStudio3DCommands());
  await withSource('animation', () => registerAnimationCommands());
  await withSource('deploy', () => registerDeployCommands(createTauriDeployBackend()));
  const raster = new CommandDispatcher();
  registerRasterCommands(() => rasterStub, k => t(k), raster);
  const base = listCommands();
  const entries: Entry[] = base.map(c => ({
    id: c.id,
    title: c.title,
    category: c.category,
    source: sourceOf.get(c.id) ?? 'core',
    ...(c.shortcut ? { shortcut: c.shortcut } : {}),
    ...(c.keywords?.length ? { keywords: [...c.keywords].sort() } : {}),
    ...(c.allowInInput ? { allowInInput: true } : {}),
    hasEnabled: c.enabled !== undefined,
  }));
  const have = new Set(entries.map(e => e.id));
  // The raster editor scopes shared ids (edit.undo, project.save, ...) and adds its own.
  for (const s of raster.list()) if (!have.has(s.id)) entries.push({
    id: s.id, title: s.title, category: s.category, source: 'raster',
    ...(s.shortcut ? { shortcut: s.shortcut } : {}),
    hasEnabled: s.enabled !== undefined,
  });
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

function render(commands: Entry[]): string {
  return `${JSON.stringify({ version: 1, source: 'scripts/dump-ui-commands.ts', commands }, null, 2)}\n`;
}

function renderMd(commands: Entry[]): string {
  const categories = [...new Set(commands.map(c => c.category))].sort();
  const rows = commands.map(c => `| \`${c.id}\` | ${c.title} | ${c.category} | ${c.source} | ${c.shortcut ? `\`${c.shortcut}\`` : ''} |`);
  return `# UI command inventory

Generated by \`npm run inventory:ui-commands\` (scripts/dump-ui-commands.ts). Do not edit by hand.
\`npm run check:ui-commands\` fails CI when the registry and this file drift apart.

This is the UI command registry from src/lib/commands.ts (+ static collab registrations).
It is unrelated to \`check:commands\`, which guards the Tauri IPC manifest in docs/errors/.

Mount-time studio registrations (vector, sheets, slides, design, photos, pdfedit, raster) are
included; the \`source\` column names the owner. Dynamic sources that stay outside the dump
(declared in DYNAMIC_SOURCES):

${DYNAMIC_SOURCES.map(d => `- ${d.source}: \`${d.pattern}\` - ${d.why}`).join('\n')}

Every command needs a title and a \`cmd.<id>\` key in all ${LOCALES.length} locales (${LOCALES.join(', ')}); the gate enforces it.

${commands.length} commands. Categories: ${categories.join(', ')}.

| id | title | category | source | shortcut |
| --- | --- | --- | --- | --- |
${rows.join('\n')}
`;
}

const commands = await collect();
const next = render(commands);
if(process.argv.includes('--agent-matrix')){const rows=[...commandDispatcher.list().map(spec=>agentCommandReadiness(spec,'shared')), ...(()=>{const host=new CommandDispatcher();registerRasterCommands(()=>rasterStub,k=>t(k),host);return host.list().map(spec=>agentCommandReadiness(spec,'raster-host'));})()].sort((a,b)=>(a.host+':'+a.id).localeCompare(b.host+':'+b.id));const path=join(root,'..','docs','agent','command-readiness.json');const text=JSON.stringify({version:1,evidence:'schema/level inventory only; engine transaction ports unverified, not permission',rows},null,2)+'\n';if(process.argv.includes('--check')){if(!existsSync(path)||readFileSync(path,'utf8')!==text)throw Error('Agent readiness inventory drift');}else writeFileSync(path,text);}

const check = process.argv.includes('--check');
if (check) {
  let failed = false;
  const problems = keyProblems(commands);
  if (problems.length) {
    failed = true;
    console.error(`check:ui-commands: ${problems.length} title/i18n problem(s):`);
    for (const p of problems) console.error(`  ${p}`);
  }
  const current = existsSync(jsonPath) ? readFileSync(jsonPath, 'utf8') : '';
  if (current !== next) {
    failed = true;
    const have = new Set(current ? (JSON.parse(current) as { commands: Entry[] }).commands.map(c => c.id) : []);
    const want = new Set(commands.map(c => c.id));
    const added = commands.filter(c => !have.has(c.id)).map(c => c.id);
    const removed = [...have].filter(id => !want.has(id));
    console.error('docs/ui-commands.json is out of date. Run: npm run inventory:ui-commands');
    if (added.length) console.error(`  added or changed: ${added.join(', ')}`);
    if (removed.length) console.error(`  removed: ${removed.join(', ')}`);
    if (!added.length && !removed.length) console.error('  same ids, changed metadata (title/shortcut/keywords/source/enabled)');
  }
  if (failed) process.exit(1);
  console.log(`check:ui-commands OK (${commands.length} commands in sync, titles in ${LOCALES.length} locales)`);
} else {
  writeFileSync(jsonPath, next);
  writeFileSync(mdPath, renderMd(commands));
  console.log(`Wrote ${commands.length} commands to docs/ui-commands.json and docs/ui-commands.md`);
}
