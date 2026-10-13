import type {GitDiffRefsResult, GitRefFile} from './contract';
export type Translate = (key: string, params?: Record<string, string | number>) => string;
export type FileGroup = 'pages' | 'styles' | 'scripts' | 'images' | 'other';
const EXT: Record<string, FileGroup> = {html: 'pages', htm: 'pages', md: 'pages', css: 'styles', scss: 'styles', js: 'scripts', mjs: 'scripts', ts: 'scripts', tsx: 'scripts', jsx: 'scripts',
  png: 'images', jpg: 'images', jpeg: 'images', gif: 'images', webp: 'images', svg: 'images', avif: 'images'};
export const groupOf = (path: string): FileGroup => EXT[(path.split('.').pop() ?? '').toLowerCase()] ?? 'other';
const GROUPS: FileGroup[] = ['pages', 'styles', 'scripts', 'images', 'other'];
export interface Explanation {
  counts: Record<GitRefFile['kind'], number>;
  groups: {group: FileGroup; count: number}[];
  areas: string[];
  binaryCount: number;
  empty: boolean;
  incomplete: boolean;
  headline: string;
  lines: string[];
}
/** Deterministic, local explanation of a ref diff. No model call, so it can never invent a change. */
export function explain(result: GitDiffRefsResult, t: Translate): Explanation {
  const counts = {added: 0, modified: 0, deleted: 0, renamed: 0, typechange: 0};
  const byGroup = new Map<FileGroup, number>(), byArea = new Map<string, number>();
  let binaryCount = 0;
  for (const f of result.files) {
    counts[f.kind]++; if (f.binary) binaryCount++;
    byGroup.set(groupOf(f.path), (byGroup.get(groupOf(f.path)) ?? 0) + 1);
    const top = f.path.includes('/') ? f.path.split('/')[0] + '/' : '/';
    byArea.set(top, (byArea.get(top) ?? 0) + 1);
  }
  const groups = GROUPS.filter(g => byGroup.has(g)).map(g => ({group: g, count: byGroup.get(g)!}));
  const areas = [...byArea].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([a]) => a === '/' ? t('versions.explain.rootArea') : a);
  const total = result.files.length;
  const headline = total ? t('versions.explain.headline', {count: total, added: counts.added, modified: counts.modified + counts.typechange, deleted: counts.deleted, renamed: counts.renamed}) : t('versions.explain.none');
  const lines = groups.map(g => t(`versions.explain.kind.${g.group}`, {count: g.count}));
  if (areas.length > 1) lines.push(t('versions.explain.areas', {areas: areas.join(', ')}));
  if (binaryCount) lines.push(t('versions.explain.binaryNote', {count: binaryCount}));
  if (result.truncated) lines.push(t('versions.explain.truncated'));
  return {counts, groups, areas, binaryCount, empty: total === 0, incomplete: result.truncated, headline, lines};
}
const short = (sha: string) => sha.slice(0, 8);
/** Plain markdown for a client changelog. Lists paths only; never copies patch text or commit bodies. */
export function changelogMarkdown(result: GitDiffRefsResult, t: Translate): string {
  const ex = explain(result, t);
  const out = [`## ${t('versions.explain.changelogTitle', {from: short(result.from.sha), to: short(result.to.sha)})}`, '', ex.headline, ''];
  for (const kind of ['added', 'modified', 'renamed', 'deleted', 'typechange'] as const) {
    const files = result.files.filter(f => f.kind === kind);
    if (!files.length) continue;
    out.push(`**${t(`versions.explain.file.${kind}`)}**`);
    for (const f of files) out.push(`- ${f.path.replace(/[`\r\n]/g, '')}${f.oldPath ? ` (${t('versions.explain.renamedFrom', {path: f.oldPath.replace(/[`\r\n]/g, '')})})` : ''}`);
    out.push('');
  }
  if (result.truncated) out.push(t('versions.explain.truncated'), '');
  return out.join('\n').trimEnd() + '\n';
}
