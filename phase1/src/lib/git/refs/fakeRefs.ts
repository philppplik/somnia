import type {GitRefsBackend, GitRefFile, GitSafetyEntry, GitTreeEntry} from './contract';
const hex = (c: string) => c.repeat(40).slice(0, 40);
export const sha = hex;
/** In-memory ref backend for tests and web previews. Trees map ref name -> {path: text}. */
export function createFakeRefs(trees: Record<string, Record<string, string>>, opts: {safety?: GitSafetyEntry[]; full?: boolean; moved?: {ref: string; to: string}} = {}): GitRefsBackend & {calls: string[]} {
  const ids = Object.keys(trees); const calls: string[] = [];
  const shaOf = (ref: string) => opts.moved?.ref === ref ? opts.moved.to : hex((ids.indexOf(ref) + 10).toString(16).slice(-1) || 'a');
  const treeOf = (ref: string) => hex((ids.indexOf(ref) + 4).toString(16).slice(-1));
  const blobOf = (text: string) => { let h = 0; for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h.toString(16).padStart(8, '0').repeat(5); };
  const blobs = new Map<string, string>();
  const entries = (ref: string): GitTreeEntry[] => Object.entries(trees[ref]).map(([path, text]) => { const blob = blobOf(text); blobs.set(blob, text); return {path, blob, sizeBytes: text.length, binary: text.startsWith('\0BIN')}; });
  const b: GitRefsBackend & {calls: string[]} = {calls,
    async diffRefs({from, to}) {
      calls.push(`diff:${from}..${to}`);
      const a = entries(from), c = entries(to), files: GitRefFile[] = [];
      for (const e of c) { const o = a.find(x => x.path === e.path); if (!o) files.push({path: e.path, kind: 'added', binary: e.binary, beforeBlob: null, afterBlob: e.blob, sizeBytes: e.sizeBytes}); else if (o.blob !== e.blob) files.push({path: e.path, kind: 'modified', binary: e.binary, beforeBlob: o.blob, afterBlob: e.blob, sizeBytes: e.sizeBytes, patch: '@@ changed @@'}); }
      for (const o of a) if (!c.some(x => x.path === o.path)) files.push({path: o.path, kind: 'deleted', binary: o.binary, beforeBlob: o.blob, afterBlob: null});
      return {from: {ref: from, sha: shaOf(from), tree: treeOf(from)}, to: {ref: to, sha: shaOf(to), tree: treeOf(to)}, files, truncated: false};
    },
    async safetyList() { return opts.safety ?? []; },
  };
  if (opts.full !== false) {
    const byHex = (s: string) => ids.find(i => shaOf(i) === s) ?? s;
    b.refTree = async r => { calls.push(`tree:${r}`); const id = byHex(r); return {side: {ref: id, sha: shaOf(id), tree: treeOf(id)}, entries: entries(id), truncated: false}; };
    b.readBlob = async blob => { calls.push(`blob`); const text = blobs.get(blob); return {blob, binary: text === undefined || text.startsWith('\0BIN'), tooLarge: false, sizeBytes: text?.length ?? 0, text}; };
  }
  return b;
}
