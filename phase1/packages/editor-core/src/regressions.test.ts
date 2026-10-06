import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorProject, EditorError, type EditorNode, type Operation } from './index.js';

const file = 'index.html';
const source = '<!doctype html>\r\n<html><head><!--keep--></head><body><main><p id="first">one</p><section><span>two</span></section><p id="last">three</p></main></body></html>';
const project = () => new EditorProject({ [file]: source, 'site.css': '/* keep */\np { color: red }' });
const flatten = (nodes: EditorNode[]): EditorNode[] => nodes.flatMap(n => [n, ...flatten(n.children)]);
const node = (p: EditorProject, tag: string) => flatten(p.tree(file)).find(n => n.tag === tag)!;
const apply = (p: EditorProject, operations: Operation[], group?: string) => p.transact({ origin: 'canvas', operations, group });
const fails = (p: EditorProject, operations: Operation[], code: string) => {
  const before = p.exportState();
  assert.throws(() => apply(p, operations), (e: unknown) => e instanceof EditorError && e.code === code);
  assert.deepEqual(p.exportState(), before, 'failed edits must preserve sources, IDs, metadata and revision');
};

test('tree and node reads are isolated from caller mutations', () => {
  const p = project();
  const tree = p.tree(file), first = node(p, 'p');
  tree[0].attrs.lang = 'mutated'; tree[0].children.length = 0;
  const copy = p.node(file, first.id); copy.attrs.id = 'mutated'; copy.locked = true;
  assert.equal(node(p, 'p').attrs.id, 'first');
  assert.equal(node(p, 'p').locked, false);
  assert.ok(node(p, 'span'));
  assert.equal(p.files[file], source);
  assert.ok(Object.isFrozen(p.files));
});

test('implied HTML nodes are not exposed as editable layers; void elements keep source ranges', () => {
  const text = '<!--prefix--><p>A &amp; B</p><img src=x><script>const x = "<div>";</script>';
  const p = new EditorProject({ [file]: text, 'notes.md': '# title' });
  const nodes = flatten(p.tree(file));
  assert.deepEqual(nodes.map(n => n.tag), ['p', 'img', 'script']);
  assert.equal(text.slice(nodes[1].from, nodes[1].to), '<img src=x>');
  assert.deepEqual(p.tree('notes.md'), []);
  assert.equal(p.files[file], text);
});

test('attribute add, remove and escaping preserve exact surrounding bytes', () => {
  const text = '<p data-note=old title=keep>hello</p><img src=x />';
  const p = new EditorProject({ [file]: text });
  const para = node(p, 'p'), img = node(p, 'img');
  apply(p, [{ type: 'setAttribute', file, nodeId: para.id, name: 'data-note', value: '"<&' }]);
  assert.equal(p.files[file], '<p data-note="&quot;&lt;&amp;" title=keep>hello</p><img src=x />');
  apply(p, [{ type: 'setAttribute', file, nodeId: para.id, name: 'title', value: null }, { type: 'setAttribute', file, nodeId: img.id, name: 'alt', value: 'x & y' }]);
  assert.equal(p.files[file], '<p data-note="&quot;&lt;&amp;" >hello</p><img src=x  alt="x &amp; y"/>');
  assert.equal(p.node(file, img.id).attrs.alt, 'x & y');
});

test('reserved attributes and unsafe containers refuse edits without changing history', () => {
  const p = project();
  for (const name of ['data-somnia-id', 'DATA-SOMNIA-hidden', 'bad name']) {
    fails(p, [{ type: 'setAttribute', file, nodeId: node(p, 'p').id, name, value: 'x' }], 'invalid-attribute');
  }
  const q = new EditorProject({ [file]: '<body><script>safe()</script><img src=x></body>' });
  fails(q, [{ type: 'insertHTML', file, parentId: node(q, 'script').id, html: 'bad' }], 'unsafe-container');
  fails(q, [{ type: 'insertHTML', file, parentId: node(q, 'img').id, html: '<p>x</p>' }], 'unsupported-container');
  assert.equal(p.canUndo, false); assert.equal(q.canUndo, false);
});

test('moves in both directions retain descendant IDs, metadata and source spelling', () => {
  const p = project();
  const main = node(p, 'main'), section = node(p, 'section'), span = node(p, 'span'), first = node(p, 'p'), last = p.node(file, main.id).children.at(-1)!;
  apply(p, [{ type: 'setMeta', file, nodeId: span.id, hidden: true }]);
  apply(p, [{ type: 'move', file, nodeId: section.id, parentId: main.id, beforeId: first.id }]);
  assert.equal(p.files[file], source.replace('<p id="first">one</p><section><span>two</span></section>', '<section><span>two</span></section><p id="first">one</p>'));
  assert.equal(p.node(file, span.id).hidden, true);
  apply(p, [{ type: 'move', file, nodeId: section.id, parentId: main.id }]);
  assert.deepEqual(p.node(file, main.id).children.map(n => n.id), [first.id, last.id, section.id]);
  assert.equal(p.node(file, span.id).hidden, true);
  p.undo(); p.undo();
  assert.equal(p.files[file], source); assert.equal(p.node(file, span.id).hidden, true);
});

test('invalid move targets and protected root removals roll back the complete batch', () => {
  const p = project(), section = node(p, 'section'), span = node(p, 'span');
  fails(p, [{ type: 'move', file, nodeId: section.id, parentId: span.id }], 'invalid-drop');
  fails(p, [{ type: 'move', file, nodeId: span.id, parentId: node(p, 'main').id, beforeId: span.id }], 'invalid-drop');
  for (const tag of ['html', 'head', 'body']) fails(p, [{ type: 'remove', file, nodeId: node(p, tag).id }], 'protected-root');
});

test('a no-op move does not emit, increment revision or erase redo', () => {
  const p = project(), first = node(p, 'p');
  apply(p, [{ type: 'setText', file, nodeId: first.id, text: 'edited' }]); p.undo();
  let emitted = 0; p.subscribe('code', () => emitted++);
  const revision = p.revision;
  assert.equal(apply(p, [{ type: 'move', file, nodeId: first.id, parentId: node(p, 'main').id, beforeId: first.id }]), null);
  assert.equal(p.revision, revision); assert.equal(emitted, 0); assert.equal(p.canRedo, true);
});

test('multi-file failure restores deleted files, metadata and existing redo branch', () => {
  const p = project(), first = node(p, 'p');
  apply(p, [{ type: 'setText', file, nodeId: first.id, text: 'edited' }]); p.undo();
  fails(p, [
    { type: 'deleteFile', file: 'site.css' },
    { type: 'createFile', file: 'new.html', text: '<p>new</p>' },
    { type: 'setMeta', file, nodeId: first.id, locked: true, hidden: true },
    { type: 'remove', file, nodeId: 'missing' },
  ], 'missing-node');
  assert.equal(p.canRedo, true);
  p.redo(); assert.equal(p.node(file, first.id).locked, false); assert.match(p.files[file], />edited</);
});

test('a fresh edit after undo discards only the redo branch', () => {
  const p = project(), id = node(p, 'p').id;
  for (const text of ['a', 'b']) apply(p, [{ type: 'setText', file, nodeId: id, text }]);
  p.undo(); apply(p, [{ type: 'setText', file, nodeId: id, text: 'c' }]);
  assert.equal(p.canRedo, false); assert.equal(p.redo(), null);
  p.undo(); assert.match(p.files[file], />a</); p.undo(); assert.equal(p.files[file], source);
});

test('history grouping has a strict 800ms boundary and separates edit origins', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const p = project(), id = node(p, 'p').id;
  apply(p, [{ type: 'setText', file, nodeId: id, text: 'a' }], 'typing');
  t.mock.timers.tick(799);
  apply(p, [{ type: 'setText', file, nodeId: id, text: 'ab' }], 'typing');
  t.mock.timers.tick(800);
  apply(p, [{ type: 'setText', file, nodeId: id, text: 'abc' }], 'typing');
  p.transact({ origin: 'code', group: 'typing', operations: [{ type: 'setText', file, nodeId: id, text: 'code' }] });
  p.undo(); assert.match(p.files[file], />abc</);
  p.undo(); assert.match(p.files[file], />ab</);
  p.undo(); assert.equal(p.files[file], source); assert.equal(p.canUndo, false);
});

test('history cap retains exactly the last 200 changes', () => {
  const p = new EditorProject({ 'plain.txt': 'initial' });
  for (let i = 1; i <= 201; i++) apply(p, [{ type: 'replaceSource', file: 'plain.txt', text: String(i) }]);
  for (let i = 0; i < 200; i++) assert.ok(p.undo());
  assert.equal(p.files['plain.txt'], '1'); assert.equal(p.undo(), null);
  for (let i = 0; i < 200; i++) assert.ok(p.redo());
  assert.equal(p.files['plain.txt'], '201'); assert.equal(p.redo(), null);
});

test('recovery round trip restores multiple file types and is detached from exported data', () => {
  const p = project(), id = node(p, 'span').id;
  apply(p, [{ type: 'setMeta', file, nodeId: id, locked: true, hidden: true }]);
  const state = JSON.parse(JSON.stringify(p.exportState()));
  const restored = EditorProject.fromState(state);
  state.snapshot.files[file] = 'corrupt'; state.snapshot.meta[id].locked = false;
  assert.deepEqual(restored.exportState(), p.exportState());
  assert.equal(restored.node(file, id).locked, true);
  assert.equal(restored.canUndo, false); assert.equal(restored.canRedo, false);
  assert.equal(restored.files['site.css'], p.files['site.css']);
});

test('generated CSS reuses one class/link and appends separate breakpoint rules', () => {
  const p = project(), id = node(p, 'p').id;
  apply(p, [{ type: 'setStyle', file, nodeId: id, cssFile: 'assets/site.css', properties: { color: 'blue' } }]);
  const cls = p.node(file, id).attrs.class;
  apply(p, [{ type: 'setStyle', file, nodeId: id, cssFile: 'assets/site.css', breakpoint: 480, properties: { '--space': '2rem', 'margin-top': 'var(--space)' } }]);
  assert.equal(p.node(file, id).attrs.class, cls);
  assert.equal((p.files[file].match(/rel="stylesheet"/g) || []).length, 1);
  assert.equal(p.files['assets/site.css'], `\n.${cls} { color: blue; }\n\n@media (max-width: 480px) { .${cls} { --space: 2rem; margin-top: var(--space); } }\n`);
  p.undo(); assert.equal(p.files['assets/site.css'], `\n.${cls} { color: blue; }\n`);
  p.undo(); assert.equal(p.files[file], source); assert.equal(p.files['assets/site.css'], undefined);
  p.redo(); p.redo(); assert.equal(p.node(file, id).attrs.class, cls);
});

test('missing explicit head rolls back class creation as well as stylesheet edits', () => {
  const p = new EditorProject({ [file]: '<p class="existing">text</p>' });
  fails(p, [{ type: 'setStyle', file, nodeId: node(p, 'p').id, properties: { color: 'blue' } }], 'missing-head');
  assert.equal(p.canUndo, false);
});

test('CSS invalid breakpoints and removal-only requests cannot leave partial changes', () => {
  const p = project(), id = node(p, 'p').id;
  for (const breakpoint of [0, -1, 1.5, NaN]) fails(p, [{ type: 'setStyle', file, nodeId: id, properties: { color: 'blue' }, breakpoint }], 'invalid-breakpoint');
  fails(p, [{ type: 'setStyle', file, nodeId: id, properties: { color: null } }], 'unsupported-style-removal');
});

test('file path validation rejects traversal and cross-platform unsafe segments', () => {
  const p = project();
  for (const path of ['/x.html', '../x.html', 'a/./x.html', 'a//x.html', 'a\\x.html', 'a./x.html', 'a /x.html', 'a/x.html/', 'C:/x.html', 'x\0.html']) {
    fails(p, [{ type: 'createFile', file: path, text: 'x' }], 'bad-path');
  }
  fails(p, [{ type: 'renameFile', file: 'site.css', to: 'INDEX.HTML' }], 'exists');
  assert.equal(EditorProject.validPath('assets/日本語.css'), null);
});
