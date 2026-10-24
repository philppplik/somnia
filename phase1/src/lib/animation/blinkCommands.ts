import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {frameToTick,tickToFrame} from './time';
/** Blink: the layer squeezes shut vertically for a few frames now and then, at slightly random gaps, like eyes. The anchor is the pivot. Baked linear scale keys; layers whose scale is already keyed are skipped. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_BLINK_LAYERS=20,MAX_BLINK_GAP=240,MAX_BLINKS=30,BLINK_FRAMES=4;
const rng=(seed:number)=>{let a=(seed>>>0)||1;return()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};};
/** Frame offsets (from the first frame of the layer) at which a blink starts. All ticked layers blink together. Gaps are `gap` frames plus or minus a third, and a blink never runs past `len`. */
export function blinkFrames(len:number,gap:number,seed:number):number[]{
 const r=rng(seed),out:number[]=[];let f=Math.round(gap/2+r()*gap/2);
 while(f+BLINK_FRAMES<=len&&out.length<MAX_BLINKS){out.push(f);f+=Math.max(BLINK_FRAMES+1,Math.round(gap*(0.67+r()*0.66)));}
 return out;
}
export const blinkSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.blink',title:'Make the ticked layers blink now and then',category:'Edit',level:'ui',keywords:['animation','blink','eye','eyes','close','squint','character','scale','random','idle'],
 params:{type:'object',properties:{gap:{type:'integer',minimum:8,maximum:MAX_BLINK_GAP},seed:{type:'integer',minimum:0,maximum:99999},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_BLINK_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{gap?:number;seed?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const gap=p.gap??60,seed=p.seed??1;
  if(!Number.isInteger(gap)||gap<8||gap>MAX_BLINK_GAP)return expected(`The average gap between blinks is 8 to ${MAX_BLINK_GAP} frames.`);
  if(!Number.isInteger(seed)||seed<0||seed>99999)return expected('The seed is a whole number from 0 to 99999.');
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_BLINK_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio'&&l.kind!=='null');
  if(!ls.length)return expected('Tick at least one unlocked drawable layer.');
  const edits:Edit[]=[];let done=0,skipped=0;
  ls.forEach(l=>{
   const sc=l.transform.scale;if(sc.keys.length||sc.modifiers?.length){skipped++;return;}
   const [bx,by]=sc.value as unknown as [number,number],a=tickToFrame(l.inT,c.fps),b=tickToFrame(l.outT,c.fps),fr=blinkFrames(b-a,gap,seed);
   if(!fr.length){skipped++;return;}
   const put=(f:number,y:number)=>{const t=frameToTick(a+f,c.fps);edits.push({type:'key.add',layer:l.id,prop:'scale',t},{type:'prop.set',layer:l.id,prop:'scale',t,value:[bx,Math.round(y*100)/100] as unknown as PropValue as never},{type:'key.interp',layer:l.id,prop:'scale',t,interp:'linear'});};
   for(const f of fr){put(f,by);put(f+BLINK_FRAMES/2,by*0.1);put(f+BLINK_FRAMES,by);}
   done++;
  });
  if(!done)return expected('No ticked layer can blink: scale is already keyed or animated, or the layer is too short.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:done,skipped,gap};
 }) as (p:unknown)=>unknown}];
