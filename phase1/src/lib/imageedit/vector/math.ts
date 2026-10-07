import type { Matrix } from './types';
export const IDENTITY: Matrix = Object.freeze([1, 0, 0, 1, 0, 0]) as unknown as Matrix;
/**
 * Maps (x,y) to (a*x+c*y+e, b*x+d*y+f). multiply(m, n) applies n first, then m,
 * so world = multiply(parentWorld, local).
 */
export function multiply(m: Matrix, n: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m, [a2, b2, c2, d2, e2, f2] = n;
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}
export function applyMatrix(m: Matrix, x: number, y: number): [number, number] { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
export const determinant = (m: Matrix) => m[0] * m[3] - m[1] * m[2];
/** Returns null for singular (or near-singular) matrices; never divides by zero. */
export function invert(m: Matrix): Matrix | null {
  const det = determinant(m);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const [a, b, c, d, e, f] = m;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
export const isIdentity = (m: Matrix) => m.every((v, i) => v === IDENTITY[i]);
export const translation = (tx: number, ty: number): Matrix => [1, 0, 0, 1, tx, ty];
export const scaling = (sx: number, sy: number): Matrix => [sx, 0, 0, sy, 0, 0];
export function rotation(degrees: number): Matrix {
  const r = (degrees * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}
