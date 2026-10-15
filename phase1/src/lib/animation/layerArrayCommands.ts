import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,newId,type Layer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
import {clearLayerSet,layerSetIds,toggleLayerInSet} from './layerSet';
/** Array: copies of one layer laid out in a grid, row, column or circle. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const ARRAY_PATTERNS=['grid','circle'] as const;
export type ArrayPattern=typeof ARRAY_PATTERNS[number];
export const MAX_ARRAY_COUNT=50,MAX_ARRAY_SPACING=5000,MAX_ARRAY_RADIUS=5000;
const round=(n:number)=>Math.round(n*100)/100;
export interface ArrayOpts{columns?:number;dx?:number;dy?:number;radius?:number;rotate?:boolean;startAngle?:number}
/** Offset of every slot from slot 0 (the original layer): position change and rotation change in degrees. */
export function arrayOffsets(pattern:ArrayPattern,count:number,o:ArrayOpts):{x:number;y:number;rot:number}[]{
 const out:{x:number;y:number;rot:number}[]=[];
 if(pattern==='grid'){const cols=Math.max(1,Math.min(count,o.columns??Math.ceil(Math.sqrt(count))));
  for(let i=0;i<count;i++)out.push({x:round((i%cols)*(o.dx??100)),y:round(Math.floor(i/cols)*(o.dy??100)),rot:0});return out;}
 const r=o.radius??200,a0=(o.startAngle??-90)*Math.PI/180;
 for(let i=0;i<count;i++){const a=a0+2*Math.PI*i/count;out.push({x:round(r*(Math.cos(a)-Math.cos(a0))),y:round(r*(Math.sin(a)-Math.sin(a0))),rot:o.rotate?round(360*i/count):0});}
 return out;
}
const shift=(v:PropValue,x:number,y:number):PropValue=>Array.isArray(v)?[round(v[0]+x),round(v[1]+y)] as PropValue:v;
/** Edits that move/rotate the copy `id` of layer `l` by an offset; keyed properties move every key. */
export function placeEdits(l:Layer,id:string,off:{x:number;y:number;rot:number}):Edit[]{
 const e:Edit[]=[];
 if(off.x||off.y){const p=l.transform.position;if(p.keys.length)for(const k of p.keys)e.push({type:'prop.set',layer:id,prop:'position',t:k.t,value:shift(k.v,off.x,off.y)});else e.push({type:'prop.set',layer:id,prop:'position',value:shift(p.value as PropValue,off.x,off.y),t:0});}
 if(off.rot){const p=l.transform.rotation;if(p.keys.length)for(const k of p.keys)e.push({type:'prop.set',layer:id,prop:'rotation',t:k.t,value:round((k.v as number)+off.rot)});else e.push({type:'prop.set',layer:id,prop:'rotation',value:round((p.value as number)+off.rot),t:0});}
 return e;
}
export const layerArraySpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.array',title:'Make an array of copies of the layer in a grid or circle',category:'Edit',level:'ui',keywords:['animation','layer','array','clone','copies','grid','row','column','circle','radial','repeat','pattern','duplicate'],
 params:{type:'object',properties:{pattern:{enum:[...ARRAY_PATTERNS]},count:{type:'integer',minimum:2,maximum:MAX_ARRAY_COUNT},columns:{type:'integer',minimum:1,maximum:MAX_ARRAY_COUNT},dx:{type:'number',minimum:-MAX_ARRAY_SPACING,maximum:MAX_ARRAY_SPACING},dy:{type:'number',minimum:-MAX_ARRAY_SPACING,maximum:MAX_ARRAY_SPACING},radius:{type:'number',minimum:1,maximum:MAX_ARRAY_RADIUS},rotate:{type:'boolean'},startAngle:{type:'number',minimum:-360,maximum:360},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_ARRAY_COUNT}},required:['pattern','count'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{pattern:ArrayPattern;count:number;columns?:number;dx?:number;dy?:number;radius?:number;rotate?:boolean;startAngle?:number;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!ARRAY_PATTERNS.includes(p?.pattern))return expected('Unknown array pattern.');
  if(!Number.isInteger(p.count)||p.count<2||p.count>MAX_ARRAY_COUNT)return expected(`The array needs 2 to ${MAX_ARRAY_COUNT} layers in total.`);
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].filter(id=>!!findLayer(c,id));
  if(ids.length!==1)return expected('Select exactly one layer to repeat.');
  const l=findLayer(c,ids[0])!;if(l.locked||l.kind==='audio')return expected('This layer is locked or cannot be repeated.');
  if(c.layers.length+p.count-1>500)return expected('The composition would get too many layers.');
  const w=(l.source.width??80)*Math.abs((l.transform.scale.value as readonly number[])[0]??100)/100,h=(l.source.height??80)*Math.abs((l.transform.scale.value as readonly number[])[1]??100)/100;
  const offs=arrayOffsets(p.pattern,p.count,{...p,dx:p.dx??round(w+20),dy:p.dy??round(h+20)});
  const made=offs.slice(1).map(()=>newId('layer')),edits:Edit[]=[];
  made.forEach((id,i)=>{edits.push({type:'layers.duplicate',layers:[l.id],ids:[id]},...placeEdits(l,id,offs[i+1]));});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  clearLayerSet();made.forEach(id=>toggleLayerInSet(id));s.setView({selectedLayer:l.id,selectedKey:null});
  return {layers:made.length};
 }) as (p:unknown)=>unknown}];
