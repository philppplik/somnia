import type {GitBackend, GitFileDiff} from '../git/types';
import {sourceDiff} from '../sourceDiff';

/** Text snapshots only. Undefined is a missing file, not an empty file. */
export interface VisualSnapshot {
  files: Readonly<Record<string, string>>;
  label: string;
  incomplete?: boolean;
}
export interface VisualComparison {
  path: string;
  before: VisualSnapshot;
  after: VisualSnapshot;
  binary?: boolean;
}
export type VisualDiffMode = 'slider' | 'side-by-side' | 'only-changes';
export const MAX_PREVIEW_BYTES = 1024 * 1024;
export const MAX_FILES = 2000;
export const STATIC_LIMITS = 'Static preview only. Scripts, frames, forms, remote resources and fonts are disabled. Images are omitted. Dynamic layouts may differ. The viewport crops content; this is not a pixel diff.';

export function safePath(path: string): boolean {
  return !!path && !/^[\/\\]|^[a-z]:|[\0\\]/i.test(path) && path.split('/').every(p => p !== '..' && p !== '.' && p !== '');
}
export function fileChanges(comparison: VisualComparison) {
  const before = Object.hasOwn(comparison.before.files, comparison.path) ? comparison.before.files[comparison.path] : undefined;
  const after = Object.hasOwn(comparison.after.files, comparison.path) ? comparison.after.files[comparison.path] : undefined;
  if (comparison.binary) return {lines: [], limited: true};
  // Avoid the spurious empty line produced by splitting a missing side.
  if (before === undefined || after === undefined) {
    const text = before ?? after;
    if (text === undefined || text === '') return {lines: [], limited: false};
    if (text.length > 500000) return {lines: [], limited: true};
    return {lines: text.split('\n').map((text, i): import('../sourceDiff').DiffLine => before === undefined ? {kind: 'added', text, editorLine: i + 1} : {kind: 'removed', text, diskLine: i + 1}), limited: false};
  }
  const result = sourceDiff(before, after);
  return result;
}
/** Read-only adapter for Versions. No status, staging, commit, disk or network calls. */
export async function loadGitComparison(backend: GitBackend, path: string, base: GitFileDiff['base'] = 'head', target: GitFileDiff['target'] = 'worktree'): Promise<VisualComparison> {
  if (!safePath(path)) throw new Error('Invalid project-relative path');
  const diff = await backend.diff(path, base, target);
  if (diff.path !== path || diff.base !== base || diff.target !== target) throw new Error('Diff response does not match the requested states');
  return {
    path,
    binary: diff.binary,
    before: {label: base, files: diff.before === undefined ? {} : {[path]: diff.before}, incomplete: diff.tooLarge},
    after: {label: target, files: diff.after === undefined ? {} : {[path]: diff.after}, incomplete: diff.tooLarge},
  };
}
