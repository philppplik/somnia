import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorProject, EditorError, type EditorNode, type Operation } from './index.js';

// No new runner/dependency: deterministic seeds and operation traces reproduce failures.
// Keep runs below the core's 200-entry history limit so undo-all is a valid contract.
const seeds = [1, 7, 42, 777, 2024, 12345, 31337, 0xdeadbeef];
function random(seed: number) {
  let state = seed >>> 0;
  return {
    int(max: number) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return Math.floor((state / 0x100000000) * max);
    },
    pick<T>(items: readonly T[]): T { return items[this.int(items.length)]; },
  };
}
const values = ['plain', 'A < B & C > D', '"double" and \'single\'', '世界 🌍 café', '', '  spaced\ttext  '];
function fixture(seed: number): Record<string, string> {
  const r = random(seed), nl = r.pick(['\n', '\r\n']), quote = r.pick(['"', "'"]);
  const page = (body: string) => [
    '<!doctype HTML>', `<html lang=${quote}de${quote}>`,
    '<head><!-- keep head --><style>/* authored */ .card { color : red }</style></head>',
    `<body><!-- keep body --><main data-host=left>${body}</main>`,
    '<section data-host=right><p data-edit=other>Other &amp; text</p></section>',
    '<script>const untouched = "<p>🌙</p>";</script></body></html>',
  ].join(nl);
  // Separate text, nested inline markup, tables/mail and form/void content.
  return {
    'index.html': page(`<h1 data-edit=title title=${quote}old${quote}>Hello &amp; 世界</h1><p data-edit=copy>format me</p><div class=card><em data-edit=inline>nested</em></div>`),
    'pages/mail.html': page('<table role=presentation><tr><td><p data-edit=cell>Mail &#169;</p></td></tr></table><form><input value="keep"><label data-edit=label>Name</label></form>'),
    'styles/authored.css': '/* untouched CSS */\r\n.card { display: grid; }\r\n',
    'notes.txt': 'raw bytes: 😀\r\n\tend\n',
  };
}
function nodes(p: EditorProject, file: string): EditorNode[] {
  const flatten = (ns: EditorNode[]): EditorNode[] => ns.flatMap(n => [n, ...flatten(n.children)]);
  return flatten(p.tree(file));
}
function view(p: EditorProject) {
  return { files: { ...p.files }, trees: Object.fromEntries(Object.keys(p.files).map(f => [f, p.tree(f)])) };
}
function shape(ns: EditorNode[]): unknown {
  return ns.map(({ tag, attrs, from, to, contentFrom, contentTo, children }) =>
    ({ tag, attrs, from, to, contentFrom, contentTo, children: shape(children) }));
}
function fullParseOracle(p: EditorProject) {
  // Force the reference down the full parse path. Ignore random IDs and editor-only
  // metadata, but compare every source offset, parsed attribute and tree position.
  const reference = new EditorProject({ ...p.files });
  for (const file of Object.keys(p.files)) {
    assert.deepEqual(shape(p.tree(file)), shape(reference.tree(file)), `full parse: ${file}`);
    const ids = nodes(p, file).map(n => n.id);
    assert.equal(new Set(ids).size, ids.length, `unique identities: ${file}`);
  }
}
const kinds = ['text', 'attribute', 'style', 'insert', 'remove', 'move', 'source', 'meta', 'format', 'create', 'rename', 'delete'] as const;
function operation(p: EditorProject, r: ReturnType<typeof random>, kind: typeof kinds[number], step: number): Operation {
  const file = r.pick(['index.html', 'pages/mail.html']);
  const all = nodes(p, file), editable = all.filter(n => 'data-edit' in n.attrs);
  const target = r.pick(editable), hosts = all.filter(n => 'data-host' in n.attrs);
  switch (kind) {
    case 'text': return { type: 'setText', file, nodeId: r.pick(editable.filter(n => n.children.length === 0)).id, text: `${step}: ${r.pick(values)}` };
    case 'attribute': return { type: 'setAttribute', file, nodeId: target.id, name: r.pick(['title', 'data-custom']), value: r.pick([...values, null]) };
    case 'style': return { type: 'setStyle', file, nodeId: target.id, properties: { 'padding-left': `${r.int(80)}px` }, cssFile: 'styles/generated.css', breakpoint: r.pick([undefined, 320, 768]) };
    case 'insert': return { type: 'insertHTML', file, parentId: r.pick(hosts).id, html: `<aside data-generated="${step}"><span>new &amp; 🌙</span></aside>` };
    case 'remove': {
      const generated = all.filter(n => 'data-generated' in n.attrs);
      // Seed a removable subtree when there is none; never exhaust edit targets.
      return generated.length ? { type: 'remove', file, nodeId: r.pick(generated).id }
        : { type: 'insertHTML', file, parentId: hosts[0].id, html: '<aside data-generated="fallback">temporary</aside>' };
    }
    case 'move': return { type: 'move', file, nodeId: target.id, parentId: r.pick(hosts).id, beforeId: undefined };
    case 'source': return { type: 'replaceSource', file, text: p.files[file].replace('<!-- keep body -->', `<!-- code ${step}: 🌍 -->`) + `\n<!-- source ${step} -->` };
    case 'meta': return { type: 'setMeta', file, nodeId: target.id, hidden: !target.hidden };
    case 'format': {
      // A fresh node keeps range generation valid even after earlier markup edits.
      const text = `<p data-edit="format-${step}">format &amp; 🌙 me</p>`;
      return { type: 'insertHTML', file, parentId: hosts[0].id, html: text };
    }
    case 'create': return { type: 'createFile', file: `scratch/${step}.txt`, text: r.pick(values) };
    case 'rename': return { type: 'renameFile', file: 'notes.txt' in p.files ? 'notes.txt' : 'notes-renamed.txt', to: 'notes.txt' in p.files ? 'notes-renamed.txt' : 'notes.txt' };
    case 'delete': {
      const scratch = Object.keys(p.files).filter(f => f.startsWith('scratch/'));
      return scratch.length ? { type: 'deleteFile', file: r.pick(scratch) } : { type: 'createFile', file: `scratch/${step}.txt`, text: 'delete next' };
    }
  }
}

for (const seed of seeds) for (const incremental of [false, true]) {
  test(`property: mixed operations undo/redo and full parse (seed ${seed}, incremental ${incremental})`, () => {
    const prior = { ...EditorProject.incremental };
    Object.assign(EditorProject.incremental, { enabled: incremental, verify: incremental });
    const trace: Operation[][] = [];
    try {
      const r = random(seed), p = new EditorProject(fixture(seed)), states = [view(p)];
      for (let step = 0; step < 72; step++) {
        // First cycle covers every operation family, later cycles vary order.
        const kind = step < kinds.length ? kinds[step] : r.pick(kinds);
        const op = operation(p, r, kind, step), ops = [op];
        if (kind === 'format' && op.type === 'insertHTML') {
          // Resolve the fresh ID after insertion, then exercise entity-safe range formatting.
          trace.push([...ops]);
          const tx = p.transact({ origin: 'canvas', operations: ops });
          assert.ok(tx); states.push(view(p)); fullParseOracle(p);
          const fresh = nodes(p, op.file).find(n => n.attrs['data-edit'] === `format-${step}`)!;
          ops.splice(0, 1, { type: 'formatText', file: op.file, nodeId: fresh.id, from: 0, to: 8, mark: r.pick(['strong', 'em', 'u']) });
        }
        trace.push([...ops]);
        const beforeRevision = p.revision;
        const tx = p.transact({ origin: kind === 'source' ? 'code' : 'canvas', operations: ops });
        assert.equal(p.revision, beforeRevision + (tx ? 1 : 0));
        if (tx) states.push(view(p));
        else assert.deepEqual(view(p), states.at(-1));
        fullParseOracle(p);
      }
      assert.ok(states.length > 60, 'exercise real edits, not mostly no-ops');
      for (let i = states.length - 2; i >= 0; i--) {
        assert.ok(p.undo()); assert.deepEqual(view(p), states[i]); fullParseOracle(p);
      }
      assert.equal(p.undo(), null); assert.equal(p.canUndo, false);
      assert.deepEqual(p.files, fixture(seed), 'undo all restores every original source byte');
      for (let i = 1; i < states.length; i++) {
        assert.ok(p.redo()); assert.deepEqual(view(p), states[i]); fullParseOracle(p);
      }
      assert.equal(p.redo(), null); assert.equal(p.canRedo, false);
    } catch (error) {
      throw new Error(`seed=${seed}, incremental=${incremental}, failure=${error instanceof Error ? error.stack : String(error)}, trace=${JSON.stringify(trace)}`, { cause: error });
    } finally { Object.assign(EditorProject.incremental, prior); }
  });
}

for (const seed of seeds) {
  test(`property: local patches leave outside bytes intact (seed ${seed})`, () => {
    const r = random(seed), p = new EditorProject(fixture(seed));
    for (let step = 0; step < 30; step++) {
      const file = r.pick(['index.html', 'pages/mail.html']);
      const n = r.pick(nodes(p, file).filter(n => 'data-edit' in n.attrs));
      const before = view(p), text = `${step}${r.pick(values)}`;
      const tx = p.transact({ origin: 'canvas', operations: [{ type: 'setText', file, nodeId: n.id, text }] });
      assert.ok(tx);
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      assert.equal(p.files[file], before.files[file].slice(0, n.contentFrom) + escaped + before.files[file].slice(n.contentTo));
      for (const other of Object.keys(before.files).filter(f => f !== file)) assert.equal(p.files[other], before.files[other]);
      assert.equal(p.node(file, n.id).id, n.id);
      assert.ok(p.undo()); assert.deepEqual(view(p), before);
    }
  });

  test(`property: failed batches restore state, revision and redo history (seed ${seed})`, () => {
    const r = random(seed), p = new EditorProject(fixture(seed));
    const target = nodes(p, 'index.html').find(n => n.attrs['data-edit'] === 'title')!;
    p.transact({ origin: 'canvas', operations: [{ type: 'setText', file: 'index.html', nodeId: target.id, text: 'successful' }] });
    const after = view(p); p.undo();
    for (let step = 0; step < 24; step++) {
      const before = p.exportState(), current = view(p);
      const ops: Operation[] = [
        operation(p, r, r.pick(['text', 'attribute', 'style', 'meta', 'create', 'rename']), step),
        { type: 'remove', file: 'index.html', nodeId: 'missing-property-test-node' },
      ];
      assert.throws(() => p.transact({ origin: 'canvas', operations: ops }), (e: unknown) => e instanceof EditorError && e.code === 'missing-node');
      assert.deepEqual(p.exportState(), before); assert.deepEqual(view(p), current);
      assert.equal(p.canUndo, false); assert.equal(p.canRedo, true);
      fullParseOracle(p);
    }
    p.redo(); assert.deepEqual(view(p), after);
  });

  test(`property: recovery preserves IDs and metadata without sharing mutable state (seed ${seed})`, () => {
    const r = random(seed), p = new EditorProject(fixture(seed));
    for (const file of ['index.html', 'pages/mail.html']) {
      for (const n of nodes(p, file).filter(n => 'data-edit' in n.attrs)) {
        p.transact({ origin: 'canvas', operations: [{ type: 'setMeta', file, nodeId: n.id, locked: !!r.int(2), hidden: !!r.int(2) }] });
      }
    }
    const saved = JSON.parse(JSON.stringify(p.exportState()));
    const q = EditorProject.fromState(saved);
    assert.deepEqual(view(q), view(p)); assert.equal(q.revision, p.revision);
    assert.equal(q.canUndo, false); assert.equal(q.canRedo, false);
    saved.snapshot.files['index.html'] = 'mutated';
    for (const meta of Object.values(saved.snapshot.meta) as { locked: boolean }[]) meta.locked = !meta.locked;
    assert.deepEqual(view(q), view(p));
    const exposed = q.tree('index.html'); exposed[0].attrs.changed = 'external mutation';
    assert.deepEqual(view(q), view(p));
    fullParseOracle(q);
  });

  test(`property: grouped edits undo once and a new branch clears redo (seed ${seed})`, () => {
    const r = random(seed), p = new EditorProject(fixture(seed)), original = view(p);
    const n = nodes(p, 'index.html').find(n => n.attrs['data-edit'] === 'title')!;
    // Freeze only Date.now, the API's grouping clock, to avoid a slow CI host
    // turning this into a flaky test of the 800ms threshold.
    const now = Date.now;
    Date.now = () => 1000;
    try {
      for (let step = 0; step < 20; step++) p.transact({ origin: 'canvas', group: 'property-typing', operations: [{ type: 'setText', file: 'index.html', nodeId: n.id, text: `${step}${r.pick(values)}` }] });
      const edited = view(p);
      p.undo(); assert.deepEqual(view(p), original); assert.equal(p.canUndo, false);
      p.redo(); assert.deepEqual(view(p), edited);
      p.undo();
      p.transact({ origin: 'code', operations: [{ type: 'replaceSource', file: 'notes.txt', text: `branch ${seed}` }] });
      assert.equal(p.canRedo, false); assert.equal(p.redo(), null);
      p.undo(); assert.deepEqual(view(p), original);
    } finally { Date.now = now; }
  });
}
