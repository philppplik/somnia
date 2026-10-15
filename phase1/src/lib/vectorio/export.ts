import { formatGuides, normalizeGuides } from './guides';
import { escapeAttr } from './xml';
import { gradientSvg, pruneGradients } from './gradient';
import { fmt } from './matrix';
import { serializeContour } from './serialize';
import { BLEND_MODES, DEFAULT_STYLE, type Style, type VectorDocument, type VectorPath } from './types';

export interface ExportOptions { /** '' for a single line. Default two spaces. */ indent?: string }

function styleAttrs(s: Partial<Style> | undefined): string[] {
  if (!s) return [];
  const a: string[] = [];
  const add = (k: string, v: string) => a.push(`${k}="${escapeAttr(v)}"`);
  const num = (n: number) => fmt(n, 3);
  if (s.fill !== undefined && s.fill !== DEFAULT_STYLE.fill) add('fill', s.fill);
  if (s.stroke !== undefined && s.stroke !== DEFAULT_STYLE.stroke) add('stroke', s.stroke);
  if (s.strokeWidth !== undefined && s.strokeWidth !== 1) add('stroke-width', num(s.strokeWidth));
  if (s.lineCap && s.lineCap !== 'butt') add('stroke-linecap', s.lineCap);
  if (s.lineJoin && s.lineJoin !== 'miter') add('stroke-linejoin', s.lineJoin);
  if (s.miterLimit !== undefined && s.miterLimit !== 4) add('stroke-miterlimit', num(s.miterLimit));
  if (s.dashArray?.length) add('stroke-dasharray', s.dashArray.map(num).join(' '));
  if (s.dashOffset) add('stroke-dashoffset', num(s.dashOffset));
  if (s.strokeOpacity !== undefined && s.strokeOpacity !== 1) add('stroke-opacity', num(s.strokeOpacity));
  if (s.fillRule && s.fillRule !== 'nonzero') add('fill-rule', s.fillRule);
  if (s.fillOpacity !== undefined && s.fillOpacity !== 1) add('fill-opacity', num(s.fillOpacity));
  if (s.opacity !== undefined && s.opacity !== 1) add('opacity', num(s.opacity));
  // mix-blend-mode is CSS, not an SVG presentation attribute, so it goes into style="" (read back by the importer).
  if (s.blendMode && s.blendMode !== 'normal' && (BLEND_MODES as readonly string[]).includes(s.blendMode)) a.push(`style="mix-blend-mode:${s.blendMode}"`);
  return a;
}

/** Clean, minimal SVG: root with viewBox "0 0 w h", optional layer groups, one <path> per element. */
export function exportSvg(doc: VectorDocument, opts: ExportOptions = {}): string {
  const ind = opts.indent ?? '  ';
  const nl = ind === '' ? '' : '\n';
  const lines: string[] = [];
  const emit = (depth: number, s: string) => lines.push(ind.repeat(depth) + s);
  const w = fmt(doc.width, 3), h = fmt(doc.height, 3);
  const gd = normalizeGuides(doc.guides);
  emit(0, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${gd ? ` data-vs-guides="${formatGuides(gd)}"` : ''}>`);

  const pruned = pruneGradients(doc);
  if (pruned.gradients) {
    emit(1, '<defs>');
    for (const g of pruned.gradients) for (const l of gradientSvg(g)) emit(2, l);
    emit(1, '</defs>');
  }
  // mask shapes (one object per clipping group) become <clipPath>; the group references it
  const clipIds = new Map<string, string>();
  const clipBlocks: string[][] = [];
  {
    const byGroup = new Map<string, { ds: string[]; evenodd: boolean }>();
    const seenC = new Map<string, number>();
    for (const p of pruned.paths) {
      if (!p.clip || p.group === undefined) continue;
      const d = serializeContour(p.nodes, p.closed);
      if (!d) continue;
      let e = byGroup.get(p.group);
      if (!e) { e = { ds: [], evenodd: (p.style?.fillRule ?? 'nonzero') === 'evenodd' }; byGroup.set(p.group, e); }
      if (p.compound !== undefined && seenC.has(p.compound)) { e.ds[seenC.get(p.compound)!] += d; continue; }
      if (p.compound !== undefined) seenC.set(p.compound, e.ds.length);
      e.ds.push(d);
    }
    const hasMembers = new Set(pruned.paths.filter((p) => !p.clip && p.group !== undefined).map((p) => p.group));
    for (const [g, e] of byGroup) {
      if (!hasMembers.has(g) || e.ds.length !== 1) continue; // a mask without content (or with several objects) is not exported as a mask
      const id = `vs-clip-${g.replace(/[^A-Za-z0-9_-]/g, '_')}`;
      clipIds.set(g, id);
      clipBlocks.push([`<clipPath id="${id}">`, `  <path d="${e.ds[0]}"${e.evenodd ? ' clip-rule="evenodd"' : ''}/>`, '</clipPath>']);
    }
  }
  if (clipBlocks.length) {
    emit(1, '<defs>');
    for (const b of clipBlocks) for (const l of b) emit(2, l);
    emit(1, '</defs>');
  }
  // merge compound subpaths into one element, keep paint order of the first subpath
  const elements: { p: VectorPath; d: string }[] = [];
  const byCompound = new Map<string, number>();
  for (const p of pruned.paths) {
    if (p.clip && p.group !== undefined && clipIds.has(p.group)) continue;
    const d = serializeContour(p.nodes, p.closed);
    if (!d) continue;
    const ci = p.compound !== undefined ? byCompound.get(p.compound) : undefined;
    if (ci !== undefined) { elements[ci].d += d; continue; }
    if (p.compound !== undefined) byCompound.set(p.compound, elements.length);
    elements.push({ p, d });
  }
  let openLayer: string | undefined | null = null; // null = none open
  let openGroup: string | undefined;
  const closeGroup = () => { if (openGroup !== undefined) emit(openLayer !== null && openLayer !== undefined ? 2 : 1, '</g>'); openGroup = undefined; };
  const close = () => { closeGroup(); if (openLayer !== null && openLayer !== undefined) emit(1, '</g>'); };
  for (const { p, d } of elements) {
    if (p.layer !== openLayer || openLayer === null) {
      if (openLayer !== null) close();
      openLayer = p.layer;
      if (p.layer !== undefined) emit(1, `<g data-name="${escapeAttr(p.layer)}">`);
    }
    if (p.group !== openGroup) {
      closeGroup();
      if (p.group !== undefined) { openGroup = p.group; const gn = doc.groupNames?.[p.group]; emit(p.layer !== undefined ? 2 : 1, `<g data-vs-group="${escapeAttr(p.group)}"${gn ? ` data-vs-group-name="${escapeAttr(gn)}"` : ''}${clipIds.has(p.group) ? ` clip-path="url(#${clipIds.get(p.group)})"` : ''}>`); }
    }
    const attrs = [`d="${d}"`, ...styleAttrs(p.style)];
    if (p.name !== undefined) attrs.unshift(`data-name="${escapeAttr(p.name)}"`);
    if (p.hidden) attrs.push('display="none"');
    if (p.locked) attrs.push('data-vs-locked="1"');
    emit((p.layer !== undefined ? 2 : 1) + (p.group !== undefined ? 1 : 0), `<path ${attrs.join(' ')}/>`);
  }
  close();
  emit(0, '</svg>');
  return lines.join(nl) + '\n';
}
