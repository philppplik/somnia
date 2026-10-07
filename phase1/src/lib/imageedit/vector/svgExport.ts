import type { Paint, ShapeNode, ShapeStyle, VectorNode, VectorScene } from './types';
import { isIdentity } from './math';
import { geometryToSegments, geometryOf, polygonPoints, segmentsToData } from './path';
import { validateScene } from './scene';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const r6 = (n: number) => String(Math.round(n * 1e6) / 1e6);
function paintAttr(name: 'fill' | 'stroke', p: Paint): string {
  if (p.kind === 'none') return `${name}="none"`;
  const [r, g, b, a] = p.rgba;
  return `${name}="rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})"${a < 1 ? ` ${name}-opacity="${r6(a)}"` : ''}`;
}
function styleAttrs(s: ShapeStyle): string {
  const parts = [paintAttr('fill', s.fill), paintAttr('stroke', s.stroke)];
  if (s.fillRule !== 'nonzero') parts.push(`fill-rule="${s.fillRule}"`);
  if (s.stroke.kind === 'solid' && s.strokeWidth > 0) {
    parts.push(`stroke-width="${r6(s.strokeWidth)}"`);
    if (s.lineCap !== 'butt') parts.push(`stroke-linecap="${s.lineCap}"`);
    if (s.lineJoin !== 'miter') parts.push(`stroke-linejoin="${s.lineJoin}"`);
    if (s.lineJoin === 'miter' && s.miterLimit !== 4) parts.push(`stroke-miterlimit="${r6(s.miterLimit)}"`);
    if (s.dash.length) { parts.push(`stroke-dasharray="${s.dash.map(r6).join(' ')}"`); if (s.dashOffset !== 0) parts.push(`stroke-dashoffset="${r6(s.dashOffset)}"`); }
  }
  return parts.join(' ');
}
function common(n: VectorNode): string {
  const parts = [`data-node="${esc(n.id)}"`];
  if (!isIdentity(n.transform)) parts.push(`transform="matrix(${n.transform.map(r6).join(' ')})"`);
  if (n.opacity !== 1) parts.push(`opacity="${r6(n.opacity)}"`);
  if (!n.visible) parts.push('display="none"');
  return parts.join(' ');
}
function shapeElement(n: ShapeNode): string {
  const attrs = `${common(n)} ${styleAttrs(n.style)}`;
  switch (n.kind) {
    case 'rect': return `<rect x="${r6(n.x)}" y="${r6(n.y)}" width="${r6(n.width)}" height="${r6(n.height)}"${n.rx ? ` rx="${r6(n.rx)}"` : ''}${n.ry ? ` ry="${r6(n.ry)}"` : ''} ${attrs}/>`;
    case 'ellipse': return `<ellipse cx="${r6(n.cx)}" cy="${r6(n.cy)}" rx="${r6(n.rx)}" ry="${r6(n.ry)}" ${attrs}/>`;
    case 'polygon': return `<polygon points="${polygonPoints(n).map((p) => p.join(',')).join(' ')}" ${attrs}/>`;
    case 'line': return `<line x1="${r6(n.x1)}" y1="${r6(n.y1)}" x2="${r6(n.x2)}" y2="${r6(n.y2)}" ${attrs}/>`;
    case 'path': return `<path d="${segmentsToData(n.segments)}" ${attrs}/>`;
  }
}
/**
 * Flattened current scene in paint order (first child painted first). Allowlisted serializer over the validated scene;
 * group opacity stays group compositing; hidden nodes export with display="none". Editor locks are dropped.
 */
export function toSvg(input: VectorScene): string {
  const scene = validateScene(input);
  const out = (ids: readonly string[], pad: string): string[] => ids.flatMap((id) => {
    const n = scene.nodes[id];
    if (n.kind === 'group') return n.children.length ? [`${pad}<g ${common(n)}>`, ...out(n.children, pad + '  '), `${pad}</g>`] : [`${pad}<g ${common(n)}/>`];
    return [pad + shapeElement(n)];
  });
  const [x, y, w, h] = scene.viewBox, { width, height } = scene.outputSize;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r6(width)}" height="${r6(height)}" viewBox="${[x, y, w, h].map(r6).join(' ')}">\n${out(scene.roots, '  ').join('\n')}\n</svg>\n`;
}
export { geometryToSegments, geometryOf };
