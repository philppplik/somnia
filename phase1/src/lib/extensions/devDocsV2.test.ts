import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {parseManifestV2} from './manifestV2';
import {parsePackageFilesV2} from './packageV2';

/**
 * Dev-docs quality gates (docs/extensions/v2):
 *  1. Every example extension validates, assembles through the real package gate,
 *     and its entry's command handlers pass a mock-host unit test (granted + denied).
 *  2. Complete manifests embedded in the docs validate with the real parser.
 *  3. Every SOM-EXT / E_ code emitted by the source is documented in error-codes.md.
 *  4. The generated manifest reference is fresh.
 */

const docsRoot = new URL('../../../../docs/extensions/v2/', import.meta.url).pathname;
const examplesRoot = join(docsRoot, 'examples');
const repoRoot = new URL('../../../../', import.meta.url).pathname;

function readFolder(dir:string, prefix:string, files:Record<string,Uint8Array>):void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    const rel = prefix ? `${prefix}/${name}` : name;
    assert.ok(!stat.isSymbolicLink(), `${rel} must not be a symlink`);
    if (stat.isDirectory()) readFolder(full, rel, files);
    else files[rel] = new Uint8Array(readFileSync(full));
  }
}

function mockHost(overrides:Record<string,unknown> = {}) {
  const handlers = new Map<string,(args:unknown)=>unknown>();
  const notifications:string[] = [];
  const somnia = {
    commands: { register(id:string, handler:(args:unknown)=>unknown) { handlers.set(id, handler); return { dispose() {} }; } },
    ui: { async notify(text:string) { notifications.push(text); } },
    ...overrides,
  };
  return { somnia, handlers, notifications };
}

async function loadEntry(entry:Uint8Array) {
  const url = `data:text/javascript;base64,${Buffer.from(entry).toString('base64')}`;
  return import(url) as Promise<{ activate(somnia:unknown):void; deactivate():void }>;
}

interface ExampleSpec {
  folder: string;
  command: string;
  granted: { overrides?: Record<string,unknown>; expectNotify: RegExp };
  denied?: { overrides?: Record<string,unknown>; expectNotify: RegExp };
}

const examples:ExampleSpec[] = [
  {
    folder: 'hello-panel',
    command: 'acme.hello-panel.say-hello',
    granted: { expectNotify: /Hello from your first Somnia extension/ },
  },
  {
    folder: 'fs-consent',
    command: 'acme.fs-consent.import-file',
    granted: {
      overrides: { fs: { async readFile() { return { path: '/tmp/notes.txt', text: 'hello world' }; } } },
      expectNotify: /Imported \/tmp\/notes\.txt \(11 characters\)/,
    },
    denied: {
      overrides: { fs: { async readFile() { const e = new Error('denied') as Error & {code:string}; e.code = 'E_PERMISSION_DENIED'; throw e; } } },
      expectNotify: /not allowed/,
    },
  },
  {
    folder: 'network-host-scope',
    command: 'acme.network-host-scope.check-releases',
    granted: {
      overrides: { net: { async fetch() { return { ok: true, status: 200, body: JSON.stringify([{ tag_name: 'v11.3.0' }]) }; } } },
      expectNotify: /Latest release: v11\.3\.0/,
    },
    denied: {
      overrides: { net: { async fetch() { const e = new Error('offline') as Error & {code:string}; e.code = 'E_TIMEOUT'; throw e; } } },
      expectNotify: /offline/,
    },
  },
];

for (const spec of examples) {
  test(`example ${spec.folder}: package validates and assembles`, () => {
    const files:Record<string,Uint8Array> = {};
    readFolder(join(examplesRoot, spec.folder), '', files);
    const result = parsePackageFilesV2(files, { lane: 'store' });
    assert.ok(result.ok, JSON.stringify(result.ok ? null : result.errors));
  });
  test(`example ${spec.folder}: command handler works with a mock host`, async () => {
    const files:Record<string,Uint8Array> = {};
    readFolder(join(examplesRoot, spec.folder), '', files);
    const result = parsePackageFilesV2(files);
    assert.ok(result.ok);
    const entry = result.ok ? result.package.files['extension.js'] : undefined;
    assert.ok(entry, 'entry extension.js must exist');
    const mod = await loadEntry(entry);
    for (const scenario of [spec.granted, ...(spec.denied ? [spec.denied] : [])]) {
      const host = mockHost(scenario.overrides);
      mod.activate(host.somnia);
      const handler = host.handlers.get(spec.command);
      assert.ok(handler, `command ${spec.command} must be registered in activate()`);
      await handler({});
      assert.ok(
        host.notifications.some(n => scenario.expectNotify.test(n)),
        `expected a notification matching ${scenario.expectNotify}, got ${JSON.stringify(host.notifications)}`,
      );
    }
    mod.deactivate();
  });
}

test('complete manifests embedded in the docs validate', () => {
  for (const page of ['quickstart.md', 'manifest-reference.md']) {
    const md = readFileSync(join(docsRoot, page), 'utf8');
    const blocks = [...md.matchAll(/```toml\n([\s\S]*?)```/g)].map(m => m[1]).filter(b => /manifestVersion\s*=\s*2/.test(b));
    assert.ok(blocks.length >= 1, `${page} must contain at least one complete manifest`);
    for (const block of blocks) {
      const result = parseManifestV2(block, { lane: 'local' });
      assert.ok(result.ok, `${page}: ${JSON.stringify(result.ok ? null : result.errors)}`);
    }
  }
});

test('every emitted diagnostic code is documented in error-codes.md', () => {
  const page = readFileSync(join(docsRoot, 'error-codes.md'), 'utf8');
  const sources = ['manifestV2.ts', 'packageV2.ts'].map(f =>
    readFileSync(new URL(`./${f}`, import.meta.url), 'utf8'));
  const somExt = new Set<string>();
  for (const src of sources) for (const m of src.matchAll(/SOM-EXT-\d{3}/g)) somExt.add(m[0]);
  assert.ok(somExt.size > 0);
  for (const code of somExt) assert.ok(page.includes(code), `error-codes.md must document ${code}`);
  const runtimeSources = [
    new URL('./contracts/v2/api.ts', import.meta.url),
    new URL('./permissionBroker.ts', import.meta.url),
    new URL('./securityServices.ts', import.meta.url),
    new URL('./secretSlots.ts', import.meta.url),
  ].map(u => readFileSync(u, 'utf8'));
  const eCodes = new Set<string>();
  for (const src of runtimeSources) for (const m of src.matchAll(/'E_[A-Z_]+'/g)) eCodes.add(m[0].slice(1, -1));
  for (const code of eCodes) assert.ok(page.includes(code), `error-codes.md must document ${code}`);
});

test('generated manifest reference is fresh', () => {
  execFileSync(process.execPath, [join(repoRoot, 'scripts/generate-extension-manifest-reference.mjs'), '--check'], { stdio: 'pipe' });
});
