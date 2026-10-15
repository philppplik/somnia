/** Seeded flicker: hold keys that stutter between full and dimmed opacity, then settle on full. Pure; no model imports. */
function rng(seed:number):()=>number{let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export interface FlickerKey{frame:number;value:number}
export const MAX_FLICKER_FRAMES=120;
/** Keys at whole frames 0..frames. Each segment lasts 1 to 3 frames, alternates between a dim and a bright state at random, always starts dim and ends on `full` exactly at `frames`. */
export function flickerKeys(frames:number,full:number,seed:number):FlickerKey[]{
 const r=rng(seed),out:FlickerKey[]=[];let f=0,dim=true;
 while(f<frames){
  const v=dim?Math.round(full*(0.05+r()*0.5)*100)/100:Math.round(full*(0.75+r()*0.25)*100)/100;
  out.push({frame:f,value:v});
  f+=1+Math.floor(r()*3);dim=r()<0.5?!dim:dim;
 }
 out.push({frame:frames,value:full});
 return out;
}
