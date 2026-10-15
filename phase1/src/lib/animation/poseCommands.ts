import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluate} from './interpolate';
import {snapToFrame} from './time';
import {MAX_POSES,MAX_POSE_LAYERS,MAX_POSE_NAME,POSE_PROPS,poseId,type PoseLayer,type PoseSet} from './poseModel';
/** Pose library: the transform (position, scale, rotation, opacity) of several layers at the playhead, saved by name in the document and applied back later. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
const same=(a:PropValue,b:PropValue)=>typeof a==='number'||typeof b==='number'?a===b:a[0]===b[0]&&a[1]===b[1];
const round=(n:number)=>Math.round(n*100)/100;
/** Value `amount` percent of the way from `cur` to `goal`. */
export const blend=(cur:PropValue,goal:PropValue,amount:number):PropValue=>typeof cur==='number'&&typeof goal==='number'?round(cur+(goal-cur)*amount/100):[round(cur[0]+(goal[0]-cur[0])*amount/100),round(cur[1]+(goal[1]-cur[1])*amount/100)] as PropValue;
const dispatch=(e:Edit|Edit[])=>{try{animationSession().dispatch(e);}catch(x){if(x instanceof EditError)throw Object.assign(x,{expected:true});throw x;}};
const idsParam={type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_POSE_LAYERS};
export const poseSpecs=():CommandSpec<unknown,unknown>[]=>[
 {id:'animation.pose.save',title:'Save the layers\u2019 pose',category:'Edit',level:'ui',keywords:['animation','pose','save','library','rig','transform','position','scale','rotation','opacity'],
  params:{type:'object',properties:{name:{type:'string',minLength:1,maxLength:MAX_POSE_NAME},layers:idsParam},required:['name'],additionalProperties:false},
  enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
  run:((p:{name:string;layers?:string[]})=>{
   const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!d||!c)return expected('No composition is open.');
   const name=typeof p?.name==='string'?p.name.trim().replace(/\s+/g,' '):'';if(!name)return expected('Give the pose a name.');if(name.length>MAX_POSE_NAME)return expected(`The pose name must be at most ${MAX_POSE_NAME} characters.`);
   const t=s.getState().view.playhead;
   const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_POSE_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l&&l.kind!=='audio');
   if(!ls.length)return expected('Tick or select at least one layer.');
   const layers:PoseLayer[]=ls.map(l=>({layer:l!.id,position:evaluate(l!.transform.position,t) as [number,number],scale:evaluate(l!.transform.scale,t) as [number,number],rotation:evaluate(l!.transform.rotation,t) as number,opacity:evaluate(l!.transform.opacity,t) as number}));
   const pose:PoseSet={id:poseId(name),name,layers},cur=d.poses?.items??[],i=cur.findIndex(x=>x.id===pose.id);
   if(i<0&&cur.length>=MAX_POSES)return expected(`Up to ${MAX_POSES} poses. Delete one first.`);
   dispatch({type:'poses.set',items:i<0?[...cur,pose]:cur.map((x,j)=>j===i?pose:x)});return pose.id;
  }) as (p:unknown)=>unknown},
 {id:'animation.pose.apply',title:'Apply a saved pose',category:'Edit',level:'ui',keywords:['animation','pose','apply','library','rig','transform'],
  params:{type:'object',properties:{id:{type:'string',minLength:1,maxLength:80},keys:{type:'boolean'},amount:{type:'integer',minimum:1,maximum:100}},required:['id'],additionalProperties:false},
  enabled:()=>!!animationSession().document?.poses?.items.length,
  run:((p:{id:string;keys?:boolean;amount?:number})=>{
   const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!d||!c)return expected('No composition is open.');
   const pose=d.poses?.items.find(x=>x.id===p?.id);if(!pose)return expected('Unknown pose.');
   const amount=p.amount??100;if(!Number.isInteger(amount)||amount<1||amount>100)return expected('The amount must be a whole number from 1 to 100 percent.');
   const t=s.getState().view.playhead,tk=snapToFrame(t,c.fps),edits:Edit[]=[];let found=0,locked=0;
   for(const e of pose.layers){const l=findLayer(c,e.layer);if(!l||l.kind==='audio')continue;found++;if(l.locked){locked++;continue;}
    for(const k of POSE_PROPS){const goal=e[k] as PropValue|undefined;if(goal===undefined)continue;const pr=l.transform[k],cur=evaluate(pr,t);
     const v=amount===100?goal:blend(cur,goal,amount);const hasKey=pr.keys.some(x=>x.t===tk);
     if(same(cur,v)&&!(p.keys&&!hasKey))continue;
     if(p.keys&&!pr.keys.length)edits.push({type:'key.add',layer:l.id,prop:k,t});
     edits.push({type:'prop.set',layer:l.id,prop:k,value:v,t});}}
   if(!found)return expected('None of the pose\u2019s layers exist in this composition any more.');
   if(!edits.length)return expected(locked===found?'The pose\u2019s layers are locked.':'The layers already match this pose.');
   dispatch(edits);return {changed:edits.length,skippedLocked:locked};
  }) as (p:unknown)=>unknown},
 {id:'animation.pose.delete',title:'Delete a saved pose',category:'Edit',level:'ui',keywords:['animation','pose','delete','remove','library'],
  params:{type:'object',properties:{id:{type:'string',minLength:1,maxLength:80}},required:['id'],additionalProperties:false},
  enabled:()=>!!animationSession().document?.poses?.items.length,
  run:((p:{id:string})=>{const d=animationSession().document,cur=d?.poses?.items??[];if(!cur.some(x=>x.id===p?.id))return expected('Unknown pose.');dispatch({type:'poses.set',items:cur.filter(x=>x.id!==p.id)});}) as (p:unknown)=>unknown},
];
