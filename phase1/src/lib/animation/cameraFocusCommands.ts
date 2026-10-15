import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,type Composition,type Layer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
import {worldMatrix,applyMatrix} from './scene';
import {evaluate} from './interpolate';
import {frameToTick,snapToFrame} from './time';
import {findCamera} from './cameraCommands';
/** Camera focus: from the playhead the camera glides in until the selected layer is centred and fills about 60 percent of the frame, then holds. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_FOCUS_FRAMES=240,DEFAULT_FOCUS_FRAMES=24,MAX_FOCUS_SCALE=400,FOCUS_FILL=0.6,FALLBACK_SCALE=150,TEXT_WIDTH_EM=0.5,TEXT_LINE_EM=1.2;
/** Text has no measured size here (fonts are not measured): its box is estimated from the characters and the size, hanging from its anchor like the other layer boxes. */
const r2=(n:number)=>Math.round(n*100)/100;
/** Centre and size of the layer's box in scene space with the camera at rest, or null when its size is unknown. */
export function focusTarget(c:Composition,cam:Layer,l:Layer,t:number):{cx:number;cy:number;w:number;h:number}|null{
 const rest:Layer={...cam,parent:null,transform:{...cam.transform,position:{...cam.transform.position,keys:[],value:[c.width/2,c.height/2] as never},scale:{...cam.transform.scale,keys:[],value:[100,100] as never},rotation:{...cam.transform.rotation,keys:[],value:0 as never}}};
 const rc:Composition={...c,layers:c.layers.map(x=>x.id===cam.id?rest:x)},tl=rc.layers.find(x=>x.id===l.id)??l;
 const txt=tl.kind==='text'&&tl.source.text?{w:tl.source.text.length*(tl.source.size??50)*TEXT_WIDTH_EM,h:(tl.source.size??50)*TEXT_LINE_EM}:null;
 const w=tl.source.width??txt?.w,h=tl.source.height??txt?.h,m=worldMatrix(rc,tl,t);
 if(!(w&&h&&w>0&&h>0)){const an=tl.transform.anchor.value as unknown as [number,number],p=applyMatrix(m,[an[0],an[1]]);return {cx:p[0],cy:p[1],w:0,h:0};}
 const ps=([[0,0],[w,0],[0,h],[w,h]] as const).map(q=>applyMatrix(m,[q[0],q[1]]));
 const x0=Math.min(...ps.map(p=>p[0])),x1=Math.max(...ps.map(p=>p[0])),y0=Math.min(...ps.map(p=>p[1])),y1=Math.max(...ps.map(p=>p[1]));
 return {cx:(x0+x1)/2,cy:(y0+y1)/2,w:x1-x0,h:y1-y0};
}
/** Camera scale (percent) and position that put the target in the middle of the frame. The camera scales about its anchor at the frame centre. */
export function focusPose(c:Composition,tg:{cx:number;cy:number;w:number;h:number}):{scale:number;position:[number,number]}{
 const fit=tg.w>0&&tg.h>0?Math.min(c.width*FOCUS_FILL/tg.w,c.height*FOCUS_FILL/tg.h)*100:FALLBACK_SCALE;
 const scale=Math.round(Math.min(MAX_FOCUS_SCALE,Math.max(100,fit))),k=scale/100,cx=c.width/2,cy=c.height/2;
 return {scale,position:[r2(cx-k*(tg.cx-cx)),r2(cy-k*(tg.cy-cy))]};
}
export const cameraFocusSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.camera.focus',title:'Make the camera zoom in on the selected layer',category:'Edit',level:'ui',keywords:['animation','camera','focus','zoom','punch in','spotlight','frame','close up','highlight','emphasis'],
 params:{type:'object',properties:{layer:{type:'string'},frames:{type:'integer',minimum:1,maximum:MAX_FOCUS_FRAMES}},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document,c=d?findComp(d):undefined,sel=s.getState().view.selectedLayer;return !!c&&!!findCamera(c)&&!!sel&&sel!==findCamera(c)?.id&&c.layers.some(l=>l.id===sel);},
 run:((p:{layer?:string;frames?:number}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const cam=findCamera(c);if(!cam)return expected('Add a camera first.');if(cam.locked)return expected('The camera is locked.');
  const id=p.layer??s.getState().view.selectedLayer,target=c.layers.find(l=>l.id===id);if(!target)return expected('Select the layer the camera should zoom in on.');
  if(target.id===cam.id)return expected('The camera cannot focus on itself.');
  const n=p.frames??DEFAULT_FOCUS_FRAMES;if(!Number.isInteger(n)||n<1||n>MAX_FOCUS_FRAMES)return expected(`The move takes 1 to ${MAX_FOCUS_FRAMES} frames.`);
  const a=snapToFrame(s.getState().view.playhead,c.fps),b=a+frameToTick(n,c.fps),end=c.start+c.duration;
  if(b>end)return expected('Move the playhead earlier: the zoom would run past the end of the composition.');
  const tg=focusTarget(c,cam,target,b);if(!tg)return expected('The layer has no position to centre on.');
  const pose=focusPose(c,tg),p0=evaluate(cam.transform.position,a) as PropValue,s0=evaluate(cam.transform.scale,a) as PropValue;
  const edits:Edit[]=[];
  for(const pr of ['position','scale'] as const)for(const k of cam.transform[pr].keys)if(k.t>=a)edits.push({type:'key.remove',layer:cam.id,prop:pr,t:k.t});
  for(const [pr,v0,v1] of [['position',p0,pose.position],['scale',s0,[pose.scale,pose.scale]]] as const)
   edits.push({type:'key.add',layer:cam.id,prop:pr,t:a},{type:'prop.set',layer:cam.id,prop:pr,t:a,value:v0 as never},{type:'key.add',layer:cam.id,prop:pr,t:b},{type:'prop.set',layer:cam.id,prop:pr,t:b,value:v1 as never});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.setView({selectedLayer:cam.id});return {from:a,to:b,scale:pose.scale,target:target.id};
 }) as (p:unknown)=>unknown}];
