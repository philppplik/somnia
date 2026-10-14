/** Colour keys: linear RGB-channel mix between keys, held before the first and after the last. */
const channels=(hex:string):number[]=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
export function colorAt(keys:readonly {t:number;color:string}[]|undefined,fallback:string,tick:number):string{
 if(!keys?.length)return fallback;if(tick<=keys[0].t)return keys[0].color;
 let a=keys[0];
 for(const b of keys.slice(1)){
  if(tick<b.t){const u=(tick-a.t)/(b.t-a.t),av=channels(a.color),bv=channels(b.color);return '#'+av.map((v,i)=>Math.round((v+(bv[i]-v)*u)*255).toString(16).padStart(2,'0')).join('');}
  a=b;
 }
 return a.color;
}
