import type {Edit} from './edit';
import type {Composition,KeyRef} from './model';
export const MAX_MATCH_KEYS=800;
/** prop.set edits that copy each selected key's value from its predecessor (or successor with side next) on the same property (the end key has none). Values are read from the original document, so chains do not cascade. */
export type MatchSide='previous'|'next';
export const MATCH_SIDES:readonly MatchSide[]=['previous','next'];
export function matchPreviousEdits(comp:Composition,sel:readonly KeyRef[],side:MatchSide='previous'):Edit[]{
 if(sel.length>MAX_MATCH_KEYS)throw Object.assign(new Error('Too many keys.'),{expected:true});
 const want=new Set(sel.map(k=>`${k.layer}\0${k.prop}\0${k.t}`)),out:Edit[]=[];
 for(const l of comp.layers)for(const prop of Object.keys(l.transform) as KeyRef['prop'][]){
  const ks=l.transform[prop].keys;
  for(let i=0;i<ks.length;i++){
   const j=side==='next'?i+1:i-1;if(j<0||j>=ks.length)continue;
   if(!want.has(`${l.id}\0${prop}\0${ks[i].t}`))continue;
   if(JSON.stringify(ks[i].v)===JSON.stringify(ks[j].v))continue;
   out.push({type:'prop.set',layer:l.id,prop,t:ks[i].t,value:ks[j].v});
  }
 }
 return out;
}
