import { fmt } from './matrix';
import { isCurve } from './nodes';
import type { VectorNode } from './types';

/**
 * Canonical path data: absolute commands only, always with an explicit letter (M, L, C, Z), numbers separated by a
 * single space, at most 3 decimals, no trailing zeros, no "-0". A closed contour ends with Z; if the closing segment
 * is a curve it is written as an explicit C back to the first node before Z.
 */
export function serializeContour(nodes: VectorNode[], closed: boolean): string {
  if (nodes.length === 0) return '';
  const f = (n: number) => fmt(n, 3);
  const pt = (x: number, y: number) => `${f(x)} ${f(y)}`;
  let d = `M${pt(nodes[0].x, nodes[0].y)}`;
  const seg = (a: VectorNode, b: VectorNode) => {
    if (isCurve(a, b)) {
      const o = a.out ?? { x: a.x, y: a.y }, i = b.in ?? { x: b.x, y: b.y };
      d += `C${pt(o.x, o.y)} ${pt(i.x, i.y)} ${pt(b.x, b.y)}`;
    } else d += `L${pt(b.x, b.y)}`;
  };
  for (let k = 0; k + 1 < nodes.length; k++) seg(nodes[k], nodes[k + 1]);
  if (closed) {
    if (nodes.length > 1 && isCurve(nodes[nodes.length - 1], nodes[0])) seg(nodes[nodes.length - 1], nodes[0]);
    d += 'Z';
  }
  return d;
}
