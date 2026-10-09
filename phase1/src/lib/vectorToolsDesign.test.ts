import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';

/** Checks the vector tools design files in docs/design against each other and against the real tokens, locales and commands. */
const root = resolve(process.cwd(), process.cwd().endsWith('phase1') ? '..' : '.');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const tokensCss = read('phase1/src/styles/tokens.css');
const spec = JSON.parse(read('docs/design/vector-tools.tokens.json'));
const i18n = JSON.parse(read('docs/design/vector-tools-i18n.json')) as Record<string, Record<string, string>>;
const shortcuts = JSON.parse(read('docs/design/vector-tools-shortcuts.json')) as Record<string, Record<string, string>>;
const doc = read('docs/design/vector-tools.md');

function block(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of tokensCss.split('\n')) {
    if (!line.startsWith(selector + '{')) continue;
    for (const m of line.matchAll(/(--[a-z0-9-]+):([^;}]+)/g)) out[m[1]] = m[2].trim();
  }
  return out;
}
const dark = {...block(':root')};
const light = {...dark, ...block(':root[data-theme=light]')};

function resolveColor(value: string, theme: Record<string, string>, extra: Record<string, string>): string {
  const m = /^var\((--[a-z0-9-]+)\)$/.exec(value);
  if (!m) return value;
  const next = extra[m[1]] ?? theme[m[1]];
  assert.ok(next, `unresolved token ${m[1]}`);
  return resolveColor(next, theme, extra);
}
function lum(hex: string): number {
  if (/^#[0-9a-f]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map(c => c + c).join('');
  assert.match(hex, /^#[0-9a-f]{6}$/i, `not a hex colour: ${hex}`);
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('every new colour token resolves to a hex in dark and light', () => {
  for (const [name, v] of Object.entries(spec.colors as Record<string, {dark: string; light: string}>)) {
    resolveColor(v.dark, dark, {}); resolveColor(v.light, light, {});
    assert.ok(name.startsWith('--vt-'));
  }
});

test('new tokens do not clash with existing token names', () => {
  for (const name of [...Object.keys(spec.colors), ...Object.keys(spec.sizes)]) {
    assert.ok(!tokensCss.includes(name + ':'), `${name} already exists in tokens.css`);
  }
});

test('contrast pairs meet their minimum in default dark and light', () => {
  for (const p of spec.contrastPairs as Array<{fg: string; bg: string; min: number}>) {
    for (const [label, theme] of [['dark', dark], ['light', light]] as const) {
      const colors = spec.colors as Record<string, {dark: string; light: string}>;
      const val = (token: string) => resolveColor(colors[token] ? colors[token][label] : `var(${token})`, theme, {});
      const r = ratio(val(p.fg), val(p.bg));
      assert.ok(r >= p.min, `${p.fg} on ${p.bg} (${label}) is ${r.toFixed(2)}, needs ${p.min}`);
    }
  }
});

test('every token named in the doc is either existing or declared in the spec', () => {
  const declared = new Set([...Object.keys(spec.colors), ...Object.keys(spec.sizes)]);
  for (const m of doc.matchAll(/`(--[a-z0-9-]+)`/g)) {
    const n = m[1];
    assert.ok(declared.has(n) || tokensCss.includes(n + ':'), `doc mentions unknown token ${n}`);
  }
});

test('i18n: all 5 languages have the same keys and placeholders, none exist in the locales yet', () => {
  const langs = ['en', 'de', 'es', 'fr', 'pt-BR'];
  const keys = Object.keys(i18n.en).sort();
  assert.ok(keys.length > 30);
  for (const l of langs) {
    assert.deepEqual(Object.keys(i18n[l]).sort(), keys, `${l} keys differ`);
    for (const k of keys) {
      assert.ok(i18n[l][k].trim().length > 0, `${l}.${k} empty`);
      const ph = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort().join();
      assert.equal(ph(i18n[l][k]), ph(i18n.en[k]), `${l}.${k} placeholders`);
    }
  }
  const en = JSON.parse(read('phase1/src/locales/en.json')) as Record<string, string>;
  for (const k of keys) assert.ok(!(k in en), `${k} already in en.json; update the design doc state`);
});

test('shortcuts: no duplicates inside a scope, no clash with registered command shortcuts', () => {
  const norm = (s: string) => s.toLowerCase();
  const registered = new Set<string>();
  for (const f of readdirSync(resolve(root, 'phase1/src'), {recursive: true}) as string[]) {
    if (!/\.tsx?$/.test(f) || /\.test\.tsx?$/.test(f)) continue;
    // Studio-scoped tool keys (Vector and Design) are active only inside their own Studio; they are not global commands.
    if (/(^|\/)(vectorstudio|design)(\/|$)/.test(f)) continue;
    for (const m of read('phase1/src/' + f).matchAll(/shortcut:\s*'([^']+)'/g)) registered.add(norm(m[1]));
  }
  assert.ok(registered.has('mod+s'));
  for (const scope of ['tools', 'pen', 'commands']) {
    const vals = Object.values(shortcuts[scope]).map(norm);
    assert.equal(new Set(vals).size, vals.length, `duplicate in ${scope}`);
  }
  // Tool keys and global commands must not reuse a registered shortcut. Pen keys are scoped to an active pen path and may reuse Delete.
  for (const scope of ['tools', 'commands']) {
    for (const [id, sc] of Object.entries(shortcuts[scope])) assert.ok(!registered.has(norm(sc)), `${id} (${sc}) clashes with an existing command`);
  }
  for (const sc of Object.values(shortcuts.tools)) assert.ok(!/^mod\+/i.test(sc), 'tool keys must not use Mod');
  const all = [...Object.values(shortcuts.tools), ...Object.values(shortcuts.commands)].map(norm);
  assert.equal(new Set(all).size, all.length, 'tool and command shortcuts overlap');
});

test('doc has an Open section and no placeholder wording', () => {
  assert.match(doc, /^## 12\. Open/m);
  for (const l of Object.values(i18n)) for (const v of Object.values(l)) assert.doesNotMatch(v, /soon|bald|pronto|bientôt|em breve/i);
  assert.doesNotMatch(doc, /\u2014/);
});
