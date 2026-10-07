import type {EditorNode} from './editorPort';
export interface LockInfo { locked: boolean; inherited: boolean; by?: EditorNode }
/** Editability pre-check mirroring the core's `editable()`: the element itself and every ancestor. */
export function lockInfo(nodes: EditorNode[], id: string | null): LockInfo {
  if (!id) return { locked: false, inherited: false };
  const walk = (ns: EditorNode[], parentLock?: EditorNode): LockInfo | null => {
    for (const n of ns) {
      const by = parentLock ?? (n.locked ? n : undefined);
      if (n.id === id) return n.locked ? { locked: true, inherited: false, by: n } : by ? { locked: true, inherited: true, by } : { locked: false, inherited: false };
      const r = walk(n.children, by);
      if (r) return r;
    }
    return null;
  };
  return walk(nodes) ?? { locked: false, inherited: false };
}
export const nodeLabel = (n: Pick<EditorNode, 'tag' | 'attrs'>, max = 24): string => {
  const cls = (n.attrs?.class || '').split(/\s+/).find(c => c && !/^element-[a-f0-9]{12}$/.test(c));
  const full = cls ? `${n.tag}.${cls}` : n.tag;
  return full.length > max ? full.slice(0, max - 1) + '…' : full;
};
