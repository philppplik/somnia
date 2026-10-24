import type {ColorEase} from './model';
/** Colour keys: channel-wise RGB mix between keys, held before the first and after the last. A key's ease shapes the segment up to the next key. */
const channels=(hex:string):number[]=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
/** Cubic-bezier handles (out of the key, into the next one) per ease. Must match EASE_PRESETS in graph.ts (a test compares them). */
export const COLOR_EASE_HANDLES:Record<Exclude<ColorEase,'linear'|'hold'>,readonly [number,number,number,number]>={
 ease:[0.33,0,0.67,1],easeIn:[0.42,0,1,1],easeOut:[0,0,0.58,1],overshoot:[0.34,1.56,0.64,1],anticipate:[0.36,0,0.66,-0.56],spring:[0.3,2,0.5,1],
 smooth:[0.4,0,0.2,1],snappy:[0.2,0.9,0.3,1],back:[0.68,-0.55,0.27,1.55],expo:[0.87,0,0.13,1],
};
/** Eased progress for linear progress `u` in [0,1] (bisection on the x curve, deterministic). */
export function easeProgress(ease:ColorEase|undefined,u:number):number{
 if(!ease||ease==='linear')return u;if(ease==='hold')return 0;
 const [x1,y1,x2,y2]=COLOR_EASE_HANDLES[ease];const bez=(a:number,b:number,s:number)=>3*(1-s)*(1-s)*s*a+3*(1-s)*s*s*b+s*s*s;
 let lo=0,hi=1;for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(bez(x1,x2,mid)<u)lo=mid;else hi=mid;}
 return bez(y1,y2,(lo+hi)/2);
}
export function colorAt(keys:readonly {t:number;color:string;ease?:ColorEase}[]|undefined,fallback:string,tick:number):string{
 if(!keys?.length)return fallback;if(tick<=keys[0].t)return keys[0].color;
 let a=keys[0];
 for(const b of keys.slice(1)){
  if(tick<b.t){const u=easeProgress(a.ease,(tick-a.t)/(b.t-a.t)),av=channels(a.color),bv=channels(b.color);
   return '#'+av.map((v,i)=>Math.round(Math.min(1,Math.max(0,v+(bv[i]-v)*u))*255).toString(16).padStart(2,'0')).join('');}
  a=b;
 }
 return a.color;
}
