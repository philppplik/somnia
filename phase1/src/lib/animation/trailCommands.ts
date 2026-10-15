import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,newId,type Layer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds,clearLayerSet,toggleLayerInSet} from './layerSet';
import {layerKeyTimes} from './layerShift';
import {frameToTick} from './time';
/** Trail: faded copies of one layer that follow its motion a few frames late, like a motion trail. Each ghost is a duplicate whose keys are slipped later in time placed behind the original (the original moves back to its own place above them). Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_TRAIL=12,MAX_TRAIL_GAP=30,MAX_TRAIL_LAYERS=500;
const round=(n:number)=>Math.round(n*100)/100;
/** Opacity of ghost `i` (1-based) of `n`, as a fraction of the original: fades evenly toward but never reaches zero. */
export const ghostFactor=(i:number,n:number)=>round(1-i/(n+1));
export const trailSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.trail',title:'Add a fading trail of delayed copies behind the layer',category:'Edit',level:'ui',keywords:['animation','trail','ghost','echo','motion trail','afterimage','delay','copies','smear','streak'],
 params:{type:'object',properties:{count:{type:'integer',minimum:1,maximum:MAX_TRAIL},gap:{type:'integer',minimum:1,maximum:MAX_TRAIL_GAP},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:1}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{count?:number;gap?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const n=p.count??4,gap=p.gap??3;
  if(!Number.isInteger(n)||n<1||n>MAX_TRAIL)return expected(`A trail has 1 to ${MAX_TRAIL} ghosts.`);
  if(!Number.isInteger(gap)||gap<1||gap>MAX_TRAIL_GAP)return expected(`Each ghost is 1 to ${MAX_TRAIL_GAP} frames late.`);
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].filter(id=>!!findLayer(c,id));
  if(ids.length!==1)return expected('Tick exactly one layer to give a trail.');
  const l=findLayer(c,ids[0])!;if(l.locked||l.kind==='audio'||l.kind==='null')return expected('This layer is locked or cannot show a trail.');
  if(c.layers.length+n>MAX_TRAIL_LAYERS)return expected('The composition would get too many layers.');
  const keyT=layerKeyTimes(l),lo=c.start,hi=c.start+c.duration,step=frameToTick(gap,c.fps);
  const edits:Edit[]=[],made:string[]=[];let skipped=0;
  for(let i=1;i<=n;i++){
   const delta=step*i;
   if(keyT.some(t=>t+delta>hi||t+delta<lo)){skipped++;continue;}
   const id=newId('layer'),f=ghostFactor(i,n),o=l.transform.opacity;made.push(id);
   edits.push({type:'layers.duplicate',layers:[l.id],ids:[id]},{type:'layer.shift',layer:id,delta,mode:'slip'});
   if(o.keys.length)for(const k of o.keys)edits.push({type:'prop.set',layer:id,prop:'opacity',t:k.t+delta,value:round((k.v as number)*f)});
   else edits.push({type:'prop.set',layer:id,prop:'opacity',t:0,value:round((o.value as number)*f)});
  }
  if(!made.length)return expected('No ghost fits: its keys would run past the end of the composition. Try fewer ghosts or a smaller gap.');
  edits.push({type:'layer.reorder',layer:l.id,index:c.layers.findIndex(x=>x.id===l.id)});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  clearLayerSet();made.forEach(id=>toggleLayerInSet(id));s.setView({selectedLayer:l.id,selectedKey:null});
  return {ghosts:made.length,skipped};
 }) as (p:unknown)=>unknown}];
