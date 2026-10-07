import type { Matrix } from './types';

export const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

export const isIdentity = (m: Matrix): boolean =>
  m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const nums = (s: string): number[] => (s.match(NUM) ?? []).map(Number);

/** Parse an SVG transform list. Returns null when the string is malformed. */
export function parseTransform(src: string | undefined): Matrix | null {
  if (!src || !src.trim()) return [1, 0, 0, 1, 0, 0];
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const re = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*,?/gy;
  let last = 0;
  let r: RegExpExecArray | null;
  while ((r = re.exec(src))) {
    last = re.lastIndex;
    const a = nums(r[2]);
    let t: Matrix;
    switch (r[1]) {
      case 'matrix': if (a.length !== 6) return null; t = a as Matrix; break;
      case 'translate': if (a.length < 1 || a.length > 2) return null; t = [1, 0, 0, 1, a[0], a[1] ?? 0]; break;
      case 'scale': if (a.length < 1 || a.length > 2) return null; t = [a[0], 0, 0, a[1] ?? a[0], 0, 0]; break;
      case 'rotate': {
        if (a.length !== 1 && a.length !== 3) return null;
        const rad = (a[0] * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
        t = [c, s, -s, c, 0, 0];
        if (a.length === 3) t = multiply(multiply([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case 'skewX': if (a.length !== 1) return null; t = [1, 0, Math.tan((a[0] * Math.PI) / 180), 1, 0, 0]; break;
      default: if (a.length !== 1) return null; t = [1, Math.tan((a[0] * Math.PI) / 180), 0, 1, 0, 0];
    }
    m = multiply(m, t);
  }
  if (src.slice(last).trim() !== '') return null;
  return m;
}

export function serializeTransform(m: Matrix, precision: number): string {
  const f = (n: number) => fmt(n, precision);
  if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) return `translate(${f(m[4])} ${f(m[5])})`;
  if (m[1] === 0 && m[2] === 0 && m[4] === 0 && m[5] === 0) return m[0] === m[3] ? `scale(${f(m[0])})` : `scale(${f(m[0])} ${f(m[3])})`;
  return `matrix(${m.map(f).join(' ')})`;
}

/** Shortest decimal with at most `precision` fraction digits, no trailing zeros, no "-0". */
export function fmt(n: number, precision: number): string {
  if (!Number.isFinite(n)) return '0';
  let s = n.toFixed(precision);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s;
}
