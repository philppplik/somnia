import type {Edit} from './edit';
import type {Composition,KeyRef} from './model';
export const MAX_TAME_KEYS=800;
const clamp=(y:number)=>Math.min(1,Math.max(0,y));
/** One keys.interp edit per selected bezier key whose handles leave 0..1 in y (overshoot, anticipation). x stays. */
export function tameEdits(comp:Composition,sel:readonly KeyRef[]):Edit[]{
 if(sel.length>MAX_TAME_KEYS)throw Object.assign(new Error('Too many keys.'),{expected:true});
 const want=new Set(sel.map(k=>`${k.layer}\0${k.prop}\0${k.t}`)),out:Edit[]=[];
 for(const l of comp.layers)for(const prop of Object.keys(l.transform) as KeyRef['prop'][])
  for(const k of l.transform[prop].keys){
   if(k.interp!=='bezier'||!want.has(`${l.id}\0${prop}\0${k.t}`))continue;
   if(k.out[1]===clamp(k.out[1])&&k.in[1]===clamp(k.in[1]))continue;
   out.push({type:'keys.interp',keys:[{layer:l.id,prop,t:k.t}],interp:'bezier',out:[k.out[0],clamp(k.out[1])],in:[k.in[0],clamp(k.in[1])]});
  }
 return out;
}
