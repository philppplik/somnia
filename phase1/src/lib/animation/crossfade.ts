import type {Edit} from './edit';
import type {Composition,Layer} from './model';
export const MAX_CROSS_LAYERS=30,MAX_CROSS_FRAMES=120,DEFAULT_CROSS_FRAMES=12;
export interface CrossPlan{edits:Edit[];joins:number;skipped:number}
/** Crossfade ticked layers in the order they start: each next layer fades in over `len` ticks from its own in point while the previous one fades out over the same span (its out point is extended to the end of the overlap when it ends sooner). Layers with animated opacity, locked or audio layers are left out. Plain opacity edits, so one undo step. */
export function crossfadePlan(c:Composition,ids:readonly string[],len:number,one:number):CrossPlan{
 const all=ids.map(id=>c.layers.find(l=>l.id===id)).filter((l):l is Layer=>!!l);
 const ok=all.filter(l=>!l.locked&&l.kind!=='audio'&&!l.transform.opacity.keys.length);
 const ls=[...ok].sort((a,b)=>a.inT-b.inT);
 const edits:Edit[]=[];let joins=0;
 const fin=new Map<string,number>(),fout=new Map<string,number>(),end=new Map<string,number>();
 for(let i=0;i+1<ls.length;i++){
  const a=ls[i],b=ls[i+1],stop=b.inT+len;
  if(stop>c.duration||b.inT<=a.inT)continue;
  const outT=Math.max(a.outT,stop);if(b.outT<stop)continue;
  fout.set(a.id,b.inT);end.set(a.id,outT);fin.set(b.id,b.inT);joins++;
 }
 const used=new Set([...fin.keys(),...fout.keys()]);
 for(const l of ls){
  if(!used.has(l.id))continue;
  const full=l.transform.opacity.value as number,i0=fin.get(l.id),o0=fout.get(l.id);
  const outT=end.get(l.id)??l.outT;
  const keys:{t:number;v:number}[]=[];
  if(i0!==undefined)keys.push({t:i0,v:0},{t:i0+len-one,v:full});
  if(o0!==undefined)keys.push({t:o0,v:full},{t:outT-one,v:0});
  const ts=keys.map(k=>k.t);if(ts.some((t,i)=>i>0&&t<=ts[i-1]))continue;
  if(outT!==l.outT)edits.push({type:'layer.timing',layer:l.id,inT:l.inT,outT});
  edits.push({type:'prop.animate',layer:l.id,prop:'opacity',on:true,t:keys[0].t});
  for(const k of keys)edits.push({type:'prop.set',layer:l.id,prop:'opacity',value:k.v,t:k.t});
 }
 return {edits,joins,skipped:all.length-ok.length};
}
