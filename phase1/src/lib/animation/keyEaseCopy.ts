import type {Edit} from './edit';
import type {Composition,KeyRef} from './model';
export const MAX_EASE_COPY_KEYS=800;
const same=(a:readonly number[],b:readonly number[])=>a.length===b.length&&a.every((x,i)=>x===b[i]);
/** One keys.interp edit per property: later selected keys take the interpolation and ease handles of the earliest selected key. Keys that already match are left out. */
export function easeCopyEdits(comp:Composition,sel:readonly KeyRef[]):Edit[]{
 if(sel.length>MAX_EASE_COPY_KEYS)throw Object.assign(new Error('Too many keys.'),{expected:true});
 const want=new Set(sel.map(k=>`${k.layer}\0${k.prop}\0${k.t}`)),out:Edit[]=[];
 for(const l of comp.layers)for(const prop of Object.keys(l.transform) as KeyRef['prop'][]){
  const picked=l.transform[prop].keys.filter(k=>want.has(`${l.id}\0${prop}\0${k.t}`));
  if(picked.length<2)continue;
  const src=picked[0];
  const todo=picked.slice(1).filter(k=>k.interp!==src.interp||!same(k.out,src.out)||!same(k.in,src.in));
  if(!todo.length)continue;
  const keys:KeyRef[]=todo.map(k=>({layer:l.id,prop,t:k.t}));
  if(src.interp==='bezier')out.push({type:'keys.interp',keys,interp:'bezier',out:src.out,in:src.in});
  else out.push({type:'keys.interp',keys,interp:src.interp});
 }
 return out;
}
