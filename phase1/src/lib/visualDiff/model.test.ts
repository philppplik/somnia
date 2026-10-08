import test from 'node:test';
import assert from 'node:assert/strict';
import {fileChanges, loadGitComparison, safePath} from './model';
import type {GitBackend, GitFileDiff} from '../git/types';

function fakeBackend(result: GitFileDiff): {backend: GitBackend; calls: unknown[]} {
  const calls: unknown[] = [];
  const forbidden = async (): Promise<never> => {throw new Error('Unexpected backend mutation or read');};
  return {calls, backend: {detect: forbidden, status: forbidden, init: forbidden, commit: forbidden, log: forbidden, restoreAsNewVersion: forbidden,
    diff: async (...args) => {calls.push(args); return result;}}};
}
test('adapter uses only GitBackend.diff and preserves missing/empty/incomplete sides', async () => {
  const {backend, calls} = fakeBackend({path: 'hello world/ü.html', before: '', base: 'head', target: 'worktree', binary: false, tooLarge: true});
  const comparison = await loadGitComparison(backend, 'hello world/ü.html');
  assert.deepEqual(calls, [['hello world/ü.html', 'head', 'worktree']]);
  assert.equal(comparison.before.files[comparison.path], '');
  assert.equal(Object.hasOwn(comparison.after.files, comparison.path), false);
  assert.equal(comparison.before.incomplete, true);
});
test('rejects mismatched response, path traversal, NUL, Windows and absolute paths', async () => {
  const {backend} = fakeBackend({path: 'other', base: 'head', target: 'worktree', binary: false, tooLarge: false});
  await assert.rejects(loadGitComparison(backend, 'a.html'), /does not match/);
  for (const path of ['../a', 'a/../b', '/a', 'C:/a', 'a\\b', 'a\0b', './a', 'a//b']) {
    assert.equal(safePath(path), false, path);
    await assert.rejects(loadGitComparison(backend, path), /Invalid/);
  }
  assert.equal(safePath('a file/日本語\n.html'), true);
});
test('only changes distinguishes added/deleted, empty files, binary and large sources', () => {
  const comp = (before: Record<string, string>, after: Record<string, string>) => ({path: 'a', before: {files: before, label: 'Before'}, after: {files: after, label: 'After'}});
  assert.equal(fileChanges(comp({}, {a: 'hi'})).lines[0].kind, 'added');
  assert.equal(fileChanges(comp({a: 'hi'}, {})).lines[0].kind, 'removed');
  assert.deepEqual(fileChanges(comp({}, {a: ''})).lines, []);
  assert.equal(fileChanges(comp({a: 'a\r\n'}, {a: 'a\n'})).lines.some(l => l.kind !== 'same'), true);
  assert.equal(fileChanges({...comp({a: 'hi'}, {a: 'bye'}), binary: true}).limited, true);
  assert.equal(fileChanges(comp({}, {a: 'x'.repeat(500001)})).limited, true);
});
