import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentProjectTools } from './projectTools';
import { AgentToolRegistry, toolSchemaHash } from './toolRegistry';
import { createEditorToolRegistry } from './editorTools';

const files: Record<string, string> = { 'a.css': ':root {\n  --brand: red;\n}\n.btn { color: var(--brand); }\n', 'index.html': '<a class="btn">x</a>', '.env': 'SECRET=1' };
const editor = { selection: () => ({ path: 'a.css', from: 0, to: 5, text: ':root' }), diagnostics: () => [{ path: 'a.css', line: 2, severity: 'warning' as const, message: 'm' }, { path: 'other.css', line: 1, severity: 'error' as const, message: 'hidden' }] };
const mk = (grants?: any) => new AgentProjectTools({ projectId: 'p', files: () => files, allowed: () => true }, undefined, undefined, { registry: createEditorToolRegistry(), editor, grants });
const run = (t: AgentProjectTools, name: string, args: object) => t.execute({ id: '1', name, arguments: JSON.stringify(args) }, new AbortController().signal);

test('definitions include native tools; grants can hide levels and names', () => {
  assert.deepEqual(mk().definitions().map(d => d.name), ['list_files', 'read_file', 'write_file', 'get_selection', 'get_diagnostics', 'apply_css_op']);
  assert.deepEqual(mk({ levels: ['read'] }).definitions().map(d => d.name).slice(3), ['get_selection', 'get_diagnostics']);
  assert.ok(!mk({ disabled: ['apply_css_op'] }).definitions().some(d => d.name === 'apply_css_op'));
});
test('hidden or disabled tools cannot be called', async () => {
  await assert.rejects(run(mk({ levels: ['read'] }), 'apply_css_op', { op: 'add_variable', file: 'a.css', name: '--x', value: '1' }), /Unknown agent tool/);
});
test('get_selection and get_diagnostics only return authorized files', async () => {
  const t = mk();
  assert.equal(JSON.parse(await run(t, 'get_selection', {})).selection.text, ':root');
  const d = JSON.parse(await run(t, 'get_diagnostics', {})).diagnostics;
  assert.equal(d.length, 1);
  await assert.rejects(run(t, 'get_selection', { x: 1 }), /Unexpected/);
});
test('apply_css_op stages a reviewable proposal and never writes', async () => {
  const t = mk();
  await run(t, 'apply_css_op', { op: 'set_variable', file: 'a.css', name: '--brand', value: 'blue' });
  const p = t.proposals();
  assert.equal(p.length, 1);
  assert.match(p[0].after, /--brand: blue/);
  assert.equal(p[0].before, files['a.css']);
  assert.match(files['a.css'], /red/);
});
test('rename_class proposes CSS and HTML together; bad input is rejected', async () => {
  const t = mk();
  await run(t, 'apply_css_op', { op: 'rename_class', from: 'btn', to: 'button' });
  assert.deepEqual(t.proposals().map(p => p.path).sort(), ['a.css', 'index.html']);
  await assert.rejects(run(mk(), 'apply_css_op', { op: 'set_variable', file: 'a.css', name: '--nope', value: '1' }), /not found/);
  await assert.rejects(run(mk(), 'apply_css_op', { op: 'add_variable', file: 'a.css', name: '--x', value: 'a;}b' }), /not allowed/);
  await assert.rejects(run(mk(), 'apply_css_op', { op: 'add_variable', file: '.env', name: '--x', value: '1' }), /not in the current|Blocked|Unsafe/);
});
test('registry rejects duplicates, bad names and execute level; hashes change with schema', () => {
  const r = new AgentToolRegistry();
  const spec = { level: 'read' as const, definition: { name: 'x_tool', description: 'd', parameters: {} }, run: async () => '{}' };
  r.register(spec);
  assert.throws(() => r.register(spec), /already/);
  assert.throws(() => r.register({ ...spec, definition: { ...spec.definition, name: 'Bad Name' } }), /Invalid tool name/);
  assert.throws(() => r.register({ ...spec, level: 'execute', definition: { ...spec.definition, name: 'run_it' } }), /not enabled/);
  assert.notEqual(toolSchemaHash(spec.definition), toolSchemaHash({ ...spec.definition, description: 'changed' }));
});
