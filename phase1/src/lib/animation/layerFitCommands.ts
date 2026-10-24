import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Layer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
/** Scale the selected layers to the composition and centre them. Own file so the big command array keeps cheap type inference. */
export const FIT_MODES=['contain','cover','width','height'] as const;
export type FitMode=typeof FIT_MODES[number];
export const MAX_FIT_LAYERS=50;
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
const round=(n:number)=>Math.round(n*100)/100;
/** Uniform scale (percent) and position that fit the content box of `l` to the composition, or null when the layer cannot be fitted. Rotation is kept and its bounding box is what gets fitted. */
export function fitPlan(c:Composition,l:Layer,mode:FitMode):{scale:number;position:[number,number]}|null{
 const w=l.source.width,h=l.source.height,tr=l.transform;
 if(l.locked||l.kind==='audio'||l.parent||!(w&&h&&w>0&&h>0)||tr.anchor.keys.length||tr.position.keys.length||tr.scale.keys.length||tr.rotation.keys.length)return null;
 const r=(tr.rotation.value as number)*Math.PI/180,co=Math.cos(r),si=Math.sin(r);
 const bw=Math.abs(w*co)+Math.abs(h*si),bh=Math.abs(w*si)+Math.abs(h*co);if(!(bw>0&&bh>0))return null;
 const fw=c.width/bw,fh=c.height/bh,s=mode==='width'?fw:mode==='height'?fh:mode==='cover'?Math.max(fw,fh):Math.min(fw,fh);
 const a=tr.anchor.value as readonly number[],v:[number,number]=[s*(w/2-(a[0]??0)),s*(h/2-(a[1]??0))];
 return {scale:round(s*100),position:[round(c.width/2-(v[0]*co-v[1]*si)),round(c.height/2-(v[0]*si+v[1]*co))]};
}
export const layerFitSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.fit',title:'Fit the selected layers to the composition',category:'Edit',level:'ui',keywords:['animation','layer','fit','fill','cover','contain','scale','width','height','composition','size','center'],
 params:{type:'object',properties:{mode:{type:'string',enum:[...FIT_MODES]},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_FIT_LAYERS}},required:['mode'],additionalProperties:false},
 // The Rig menu passes its own ticked layers, so this must not depend on the timeline selection.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{mode:FitMode;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!FIT_MODES.includes(p?.mode))return expected('Unknown fit mode.');
  const ls=(p.layers??layerSetIds(s.getState().view.selectedLayer)).slice(0,MAX_FIT_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l);
  if(!ls.length)return expected('Select a layer first.');
  const t=s.getState().view.playhead,edits:Edit[]=[];let fitted=0;
  for(const l of ls){const f=fitPlan(c,l!,p.mode);if(!f)continue;fitted++;
   edits.push({type:'prop.set',layer:l!.id,prop:'scale',value:[f.scale,f.scale],t},{type:'prop.set',layer:l!.id,prop:'position',value:f.position,t});}
  if(!edits.length)return expected('No selected layer can be fitted (locked, audio, no size, has a parent, or animated position, scale, rotation or anchor).');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {fitted,skipped:ls.length-fitted};
 }) as (p?:unknown)=>unknown}];
