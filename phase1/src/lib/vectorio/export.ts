import { escapeAttr } from './xml';
import { fmt } from './matrix';
import { serializeContour } from './serialize';
import { DEFAULT_STYLE, type Style, type VectorDocument, type VectorPath } from './types';

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
  return a;
}

/** Clean, minimal SVG: root with viewBox "0 0 w h", optional layer groups, one <path> per element. */
export function exportSvg(doc: VectorDocument, opts: ExportOptions = {}): string {
  const ind = opts.indent ?? '  ';
  const nl = ind === '' ? '' : '\n';
  const lines: string[] = [];
  const emit = (depth: number, s: string) => lines.push(ind.repeat(depth) + s);
  const w = fmt(doc.width, 3), h = fmt(doc.height, 3);
  emit(0, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);

  // merge compound subpaths into one element, keep paint order of the first subpath
  const elements: { p: VectorPath; d: string }[] = [];
  const byCompound = new Map<string, number>();
  for (const p of doc.paths) {
    const d = serializeContour(p.nodes, p.closed);
    if (!d) continue;
    const ci = p.compound !== undefined ? byCompound.get(p.compound) : undefined;
    if (ci !== undefined) { elements[ci].d += d; continue; }
    if (p.compound !== undefined) byCompound.set(p.compound, elements.length);
    elements.push({ p, d });
  }
  let openLayer: string | undefined | null = null; // null = none open
  const close = () => { if (openLayer !== null && openLayer !== undefined) emit(1, '</g>'); };
  for (const { p, d } of elements) {
    if (p.layer !== openLayer || openLayer === null) {
      if (openLayer !== null) close();
      openLayer = p.layer;
      if (p.layer !== undefined) emit(1, `<g data-name="${escapeAttr(p.layer)}">`);
    }
    const attrs = [`d="${d}"`, ...styleAttrs(p.style)];
    if (p.name !== undefined) attrs.unshift(`data-name="${escapeAttr(p.name)}"`);
    if (p.hidden) attrs.push('display="none"');
    emit(p.layer !== undefined ? 2 : 1, `<path ${attrs.join(' ')}/>`);
  }
  close();
  emit(0, '</svg>');
  return lines.join(nl) + '\n';
}
