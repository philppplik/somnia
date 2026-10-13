/** Isolated TS6 analysis only. The application continues to build with its own TS7. */
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toolRoot = resolve(projectRoot, 'tools/layers');
const cruiseRoot = resolve(toolRoot, 'node_modules/dependency-cruiser');
const cruiseEntry = resolve(cruiseRoot, 'src/main/index.mjs');

export async function toolchain() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(cruiseRoot, 'package.json'), 'utf8'));
    // Resolving *from the cruiser*, not from this script, is important.
    const cruiseRequire = createRequire(cruiseEntry);
    const ts = cruiseRequire('typescript/package.json');
    const pins = JSON.parse(readFileSync(resolve(toolRoot, 'package.json'), 'utf8')).dependencies;
    if (manifest.version !== pins['dependency-cruiser'] || ts.version !== pins.typescript) {
      throw new Error(`Unexpected layer toolchain: dependency-cruiser ${manifest.version}, TypeScript ${ts.version}`);
    }
    const api = await import(pathToFileURL(cruiseEntry).href);
    const compiler = api.getAvailableTranspilers().find(t => t.name === 'typescript');
    if (!compiler?.available) throw new Error('Layer TypeScript transpiler is not available');
    return {api, cli: resolve(cruiseRoot, 'bin/dependency-cruiser.mjs')};
  } catch (error) {
    throw new Error(`${error.message}\nInstall the isolated toolchain with npm run layers:install. No fallback to the app compiler is allowed.`);
  }
}

export async function cruiseOutput({cwd = projectRoot, entries = ['packages/editor-core/src', 'src'], config = '.dependency-cruiser.cjs', ignoreKnown = true, outputType = 'json'} = {}) {
  const {cli} = await toolchain();
  const args = [cli, ...entries, '--config', config, '--output-type', outputType];
  if (ignoreKnown) args.push('--ignore-known');
  const result = spawnSync(process.execPath, args, {cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (result.error) throw result.error;
  if (!result.stdout || result.status === null || result.status < 0 || (outputType === 'json' && result.status !== 0)) throw new Error(result.stderr || `Layer analysis failed (${result.status})`);
  // The baseline reporter uses stderr for its count summary, not diagnostics.
  if (outputType !== 'baseline' && result.stderr.trim()) throw new Error(`Layer analysis emitted diagnostics:\n${result.stderr}`);
  return result.stdout;
}

export async function analyze(options = {}) {
  const graph = JSON.parse(await cruiseOutput({...options, outputType: 'json'}));
  if (!graph.modules?.length || !graph.summary) throw new Error('Layer analysis returned an empty or invalid graph');
  if (graph.summary.environment?.issues?.length) throw new Error(`Layer environment issues: ${JSON.stringify(graph.summary.environment.issues)}`);
  return graph;
}

export function assertCoverage(graph, cwd = projectRoot, entries = ['packages/editor-core/src', 'src']) {
  const modules = new Set(graph.modules.map(m => m.source));
  const missing = [];
  function visit(path) {
    for (const entry of readdirSync(resolve(cwd, path), {withFileTypes: true})) {
      const child = `${path}/${entry.name}`;
      if (child.startsWith('src/lib/frameworks/templates/')) continue;
      if (entry.isDirectory()) visit(child);
      else if (/\.[cm]?[jt]sx?$/.test(child) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(child) && !modules.has(child)) missing.push(child);
    }
  }
  entries.forEach(visit);
  if (missing.length) throw new Error(`Layer analysis skipped source files:\n${missing.join('\n')}`);
}

export async function run(mode) {
  if (!['check', 'baseline'].includes(mode)) throw new Error('Usage: node scripts/layers.mjs check|baseline');
  const graph = await analyze();
  assertCoverage(graph);
  process.stdout.write(await cruiseOutput({outputType: 'err-long'}));
  if (graph.summary.error || graph.summary.warn) return 1;
  if (mode === 'check') {
    if (graph.summary.baselineStale) throw new Error('Stale layer baseline. Run npm run layers:baseline to refresh it.');
    return 0;
  }
  // Only refresh after a clean gate. Never accept a new violation automatically.
  const fullGraph = await analyze({ignoreKnown: false});
  assertCoverage(fullGraph);
  const baseline = await cruiseOutput({ignoreKnown: false, outputType: 'baseline'});
  const readable = await cruiseOutput({ignoreKnown: false, outputType: 'err-long'});
  writeFileSync(resolve(projectRoot, '.dependency-cruiser-known-violations.json'), baseline);
  writeFileSync(resolve(projectRoot, 'docs/layers-violations.txt'), readable);
  console.log(`Refreshed ${fullGraph.summary.violations.length} existing layer violations.`);
  return 0;
}

if (process.argv[1] && relative(projectRoot, resolve(process.argv[1])) === 'scripts/layers.mjs') {
  try { process.exitCode = await run(process.argv[2] ?? 'check'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
