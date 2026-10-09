import type { Bounds, Matrix, PathCommand, Point } from './types.ts';
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export function multiply(a: Matrix, b: readonly number[]): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3],
    a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function point(m: Matrix, x: number, y: number): Point {
  return [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
}
export function bounds(points: readonly Point[]): Bounds {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let x=Infinity,y=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of points){x=Math.min(x,p[0]);y=Math.min(y,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}
  return { x, y, width: maxX-x, height: maxY-y };
}
/** PDF.js 6 uses compact DrawOPS (0 move, 1 line, 2 cubic, 3 quadratic, 4 close). */
export function decodePath(data: ArrayLike<number>, m: Matrix): PathCommand[] {
  const out: PathCommand[] = [];
  for (let i=0; i<data.length;) {
    const op=data[i++];
    const read = (): Point => {
      if (i+2>data.length || !Number.isFinite(data[i]) || !Number.isFinite(data[i+1])) throw Error('Invalid path coordinates.');
      const p=point(m,data[i],data[i+1]); i+=2; return p;
    };
    if (op===0 || op===1) out.push({ kind: op===0?'move':'line', point: read() });
    else if (op===2) out.push({kind:'cubic',control1:read(),control2:read(),point:read()});
    else if (op===3) out.push({kind:'quadratic',control:read(),point:read()});
    else if (op===4) out.push({kind:'close'});
    else throw Error(`Unsupported DrawOPS ${op}.`);
  }
  return out;
}
export function pathBounds(commands: PathCommand[]): Bounds {
  // Conservative control-point hull includes curves; do not pretend it is a tight Bézier bound.
  const p: Point[]=[];
  for(const c of commands) if(c.kind!=='close') {
    p.push(c.point);
    if(c.kind==='cubic')p.push(c.control1,c.control2);
    if(c.kind==='quadratic')p.push(c.control);
  }
  return bounds(p);
}
