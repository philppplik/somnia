export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export function project(p: Point, t: number[]): Point {
  return {
    x: t[0] * p.x + t[2] * p.y + t[4],
    y: t[1] * p.x + t[3] * p.y + t[5],
  };
}
export function unproject(p: Point, t: number[]): Point {
  const det = t[0] * t[3] - t[1] * t[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-10)
    throw Error("Invalid PDF viewport transform.");
  const x = p.x - t[4],
    y = p.y - t[5];
  return { x: (t[3] * x - t[2] * y) / det, y: (-t[1] * x + t[0] * y) / det };
}
export function screenRect(r: Rect, t: number[]): Rect {
  const corners = [
    project(r, t),
    project({ x: r.x + r.width, y: r.y }, t),
    project({ x: r.x, y: r.y + r.height }, t),
    project({ x: r.x + r.width, y: r.y + r.height }, t),
  ];
  const x = Math.min(...corners.map((p) => p.x)),
    y = Math.min(...corners.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...corners.map((p) => p.x)) - x,
    height: Math.max(...corners.map((p) => p.y)) - y,
  };
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export function moveRect(r: Rect, delta: Point, b: number[]): Rect {
  return {
    ...r,
    x: clamp(r.x + delta.x, b[0], b[2] - r.width),
    y: clamp(r.y + delta.y, b[1], b[3] - r.height),
  };
}
export function drawRect(a: Point, z: Point, b: number[]): Rect {
  const x = clamp(Math.min(a.x, z.x), b[0], b[2] - 8),
    y = clamp(Math.min(a.y, z.y), b[1], b[3] - 8);
  return {
    x,
    y,
    width: clamp(Math.abs(z.x - a.x), 8, b[2] - x),
    height: clamp(Math.abs(z.y - a.y), 8, b[3] - y),
  };
}
export function resizeRect(r: Rect, delta: Point, b: number[]): Rect {
  return {
    ...r,
    width: clamp(r.width + delta.x, 8, b[2] - r.x),
    height: clamp(r.height + delta.y, 8, b[3] - r.y),
  };
}
