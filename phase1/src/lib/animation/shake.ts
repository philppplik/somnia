/** Impact shake offsets: seeded, whole frames, decaying linearly to zero. Pure; no model imports. */
function rng(seed:number):()=>number{let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export const MAX_SHAKE_FRAMES=60;
/** Offset for frames 0..frames. Frame 0 and the last frame are exactly [0,0] so the layer starts and ends on its own position. Offsets alternate sign per axis so the shake reads as a rattle, not a drift. */
export function shakeOffsets(frames:number,amount:number,seed:number):[number,number][]{
 const r=rng(seed),out:[number,number][]=[];
 for(let i=0;i<=frames;i++){
  if(i===0||i===frames){out.push([0,0]);continue;}
  const decay=1-i/frames,sx=i%2?1:-1,sy=(i+Math.floor(r()*2))%2?1:-1;
  out.push([Math.round(sx*amount*decay*(0.5+r()*0.5)*100)/100,Math.round(sy*amount*decay*(0.5+r()*0.5)*100)/100]);
 }
 return out;
}
