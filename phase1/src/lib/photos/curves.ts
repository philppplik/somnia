/** Tone curves: point curves for the master (RGB) channel and each color channel, baked into the source
 * before the engine loads it - same preprocessing family as heal spots, mask dabs and the graduated/radial
 * filters, so preview, export and histogram stay one image. Pure math: no DOM, no engine. */
export interface CurvePoint{x:number;y:number;} // 0..1 input -> 0..1 output; (0,0) and (1,1) are pinned implicitly
export type CurveChannel='master'|'red'|'green'|'blue';
export interface PhotoCurves{master:CurvePoint[];red:CurvePoint[];green:CurvePoint[];blue:CurvePoint[];}
export const CURVE_CHANNELS:readonly CurveChannel[]=['master','red','green','blue'];
/** Interior points per channel; endpoints do not count. */
export const MAX_CURVE_POINTS=16;

const clamp01=(v:number)=>Math.min(1,Math.max(0,v));
export const emptyCurves=():PhotoCurves=>({master:[],red:[],green:[],blue:[]});
export const curvesNeutral=(c:PhotoCurves)=>CURVE_CHANNELS.every(ch=>(c[ch]??[]).length===0);

export function validCurvePoint(p:unknown):p is CurvePoint{
 if(!p||typeof p!=='object')return false;
 const q=p as Record<string,unknown>;
 return Number.isFinite(q.x)&&Number.isFinite(q.y)&&(q.x as number)>0&&(q.x as number)<1&&(q.y as number)>=0&&(q.y as number)<=1;
}
export function validCurves(c:unknown):c is PhotoCurves{
 if(!c||typeof c!=='object')return false;
 const q=c as Record<string,unknown>;
 if(!Object.keys(q).every(k=>(CURVE_CHANNELS as readonly string[]).includes(k)))return false; // unknown channels throw like unknown settings keys
 return CURVE_CHANNELS.every(ch=>Array.isArray(q[ch])&&(q[ch] as unknown[]).length<=MAX_CURVE_POINTS&&(q[ch] as unknown[]).every(validCurvePoint));
}
/** Sorted by x, clamped, near-duplicate x collapsed (the later point wins), capped. The stored form. */
export function sanitizeCurvePoints(pts:readonly CurvePoint[]):CurvePoint[]{
 const sorted=pts.map(p=>({x:clamp01(p.x),y:clamp01(p.y)})).filter(p=>p.x>0&&p.x<1).sort((a,b)=>a.x-b.x);
 const out:CurvePoint[]=[];
 for(const p of sorted){const last=out[out.length-1];if(last&&p.x-last.x<1e-4)out[out.length-1]=p;else out.push(p);}
 return out.slice(0,MAX_CURVE_POINTS);
}

/** Monotone cubic Hermite (Fritsch-Carlson) through (0,0), the sorted points, (1,1): smooth, but it never
 * overshoots between points, so the 256-entry lookup stays non-decreasing for a non-decreasing point set. */
export function curveLut(pts:readonly CurvePoint[]):Uint8ClampedArray{
 const lut=new Uint8ClampedArray(256);
 if(pts.length===0){for(let v=0;v<256;v++)lut[v]=v;return lut;}
 const xs=[0,...pts.map(p=>p.x),1],ys=[0,...pts.map(p=>p.y),1],n=xs.length-1;
 const d:number[]=[];for(let i=0;i<n;i++)d.push((ys[i+1]-ys[i])/(xs[i+1]-xs[i]));
 const m:number[]=[d[0]];for(let i=1;i<n;i++)m.push((d[i-1]+d[i])/2);m.push(d[n-1]);
 for(let i=0;i<n;i++){
  if(d[i]===0){m[i]=0;m[i+1]=0;continue;}
  const a=m[i]/d[i],b=m[i+1]/d[i],s=a*a+b*b;
  if(s>9){const t=3/Math.sqrt(s);m[i]=t*a*d[i];m[i+1]=t*b*d[i];}
 }
 let seg=0;
 for(let v=0;v<256;v++){
  const x=v/255;while(seg<n-1&&x>xs[seg+1])seg++;
  const h=xs[seg+1]-xs[seg],t=(x-xs[seg])/h,t2=t*t,t3=t2*t;
  const y=(2*t3-3*t2+1)*ys[seg]+(t3-2*t2+t)*h*m[seg]+(-2*t3+3*t2)*ys[seg+1]+(t3-t2)*h*m[seg+1];
  lut[v]=Math.round(clamp01(y)*255);
 }
 return lut;
}

/** Applies master, then the per-channel curves, on a copy of the frame (the input is never mutated).
 * Fully neutral curves return the input frame untouched. Alpha passes through. */
export function applyCurves(frame:{bytes:ArrayBuffer;width:number;height:number},curves:PhotoCurves):{bytes:ArrayBuffer;width:number;height:number}{
 if(curvesNeutral(curves))return frame;
 const lm=curveLut(sanitizeCurvePoints(curves.master)),lr=curveLut(sanitizeCurvePoints(curves.red)),lg=curveLut(sanitizeCurvePoints(curves.green)),lb=curveLut(sanitizeCurvePoints(curves.blue));
 const out=frame.bytes.slice(0);const px=new Uint8Array(out);
 for(let o=0;o+3<px.length;o+=4){px[o]=lr[lm[px[o]]];px[o+1]=lg[lm[px[o+1]]];px[o+2]=lb[lm[px[o+2]]];}
 return{bytes:out,width:frame.width,height:frame.height};
}
/** Stable identity of the curves: drives the engine reload invariant and the settings signature. */
export const curvesSignature=(c:PhotoCurves)=>JSON.stringify(CURVE_CHANNELS.map(ch=>sanitizeCurvePoints(c[ch]??[]).map(p=>[p.x,p.y])));
