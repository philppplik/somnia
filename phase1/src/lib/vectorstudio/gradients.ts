import type {Gradient,GradientStop,VectorDocument} from '../vectorio';
import {GRADIENT_LIMITS} from '../vectorio';
import {gradientFill,gradientIdOf,pruneGradients} from '../vectorio/gradient';
import {selectedPaths} from './selectionClosure';
import {pathBox} from './geometry';

export const GRADIENT_KINDS=['none','linear','radial'] as const;
export type GradientKind=typeof GRADIENT_KINDS[number];
export interface GradientPatch{kind?:GradientKind;angle?:number;startColor?:string;endColor?:string;stops?:GradientStop[]}
const HEX=/^#[0-9a-fA-F]{6}$/;
/** #rrggbb as is, anything else black (colour inputs need a plain hex value). */
export const hexOr=(c:string|undefined):string=>c&&HEX.test(c)?c:'#000000';
const r4=(n:number)=>Math.round(n*1e4)/1e4;

/** Angle in degrees (0 = left to right, 90 = top to bottom) of a linear gradient vector. */
export const angleOf=(g:Gradient):number=>g.kind==='linear'?((Math.round(Math.atan2(g.y2-g.y1,g.x2-g.x1)*180/Math.PI)%360)+360)%360:0;
/** Vector through the box centre that spans the box corners for the given angle (CSS-like). */
function linearFor(angle:number){const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),h=(Math.abs(c)+Math.abs(s))/2;return{x1:r4(.5-c*h),y1:r4(.5-s*h),x2:r4(.5+c*h),y2:r4(.5+s*h)};}
const solid=(fill:string|undefined)=>fill&&HEX.test(fill)?fill.toLowerCase():'#000000';

/**
 * Set, edit or remove the gradient fill of the selection (one commit by the caller). All selected objects share one new
 * gradient that is sized to each object's own box. Unspecified fields keep the current gradient of the first selected
 * path, so changing only the angle keeps imported multi-stop gradients intact.
 */
export const GRADIENT_TARGETS=['fill','stroke'] as const;
export type GradientTarget=typeof GRADIENT_TARGETS[number];
export function applyGradient(doc:VectorDocument,ids:readonly string[],patch:GradientPatch,target:GradientTarget='fill'):VectorDocument{
  if(!GRADIENT_TARGETS.includes(target))throw new RangeError('target must be fill or stroke');
  const chosen=selectedPaths(doc,ids);if(!chosen.length)return doc;
  if(target==='stroke'&&patch.kind!=='none')for(const p of chosen){if(p.clip)continue;const b=pathBox(p);if(!b||b.maxX-b.minX<=0||b.maxY-b.minY<=0)throw new RangeError('A gradient stroke needs objects with both width and height (a straight horizontal or vertical line would not be drawn)');}
  if(patch.angle!==undefined&&!(Number.isFinite(patch.angle)&&patch.angle>=0&&patch.angle<=360))throw new RangeError('angle must be 0-360');
  for(const c of [patch.startColor,patch.endColor])if(c!==undefined&&!HEX.test(c))throw new RangeError('colours must be #rrggbb');
  if(patch.stops){
    if(patch.stops.length<2||patch.stops.length>GRADIENT_LIMITS.maxStops)throw new RangeError(`stops: 2-${GRADIENT_LIMITS.maxStops} required`);
    for(const s of patch.stops)if(!(Number.isFinite(s.offset)&&s.offset>=0&&s.offset<=1&&Number.isFinite(s.opacity)&&s.opacity>=0&&s.opacity<=1&&HEX.test(s.color)))throw new RangeError('invalid stop');
  }
  const first=chosen[0],curId=gradientIdOf(first.style?.[target]),cur=curId?doc.gradients?.find(g=>g.id===curId):undefined;
  if(patch.kind==='none'||(patch.kind===undefined&&!cur&&!patch.stops&&patch.angle===undefined&&patch.startColor===undefined&&patch.endColor===undefined)){
    if(!cur)return doc;
    const color=cur.stops[0]?.color??'#000000',set=new Set(chosen.map(p=>p.id));
    const next={...doc,paths:doc.paths.map(p=>set.has(p.id)&&gradientIdOf(p.style?.[target])?{...p,style:{...p.style,[target]:HEX.test(color)?color:'#000000'}}:p)};
    return prune(next);
  }
  const kind=patch.kind??cur?.kind??'linear';
  let stops:GradientStop[]=patch.stops?patch.stops.map(s=>({...s,color:s.color.toLowerCase()})):cur?cur.stops.map(s=>({...s})):[{offset:0,color:solid(first.style?.[target]),opacity:1},{offset:1,color:'#ffffff',opacity:1}];
  if(patch.startColor)stops[0]={...stops[0],color:patch.startColor.toLowerCase()};
  if(patch.endColor)stops[stops.length-1]={...stops[stops.length-1],color:patch.endColor.toLowerCase()};
  if(stops.length===1)stops=[stops[0],{...stops[0],offset:1}];
  const used=new Set((doc.gradients??[]).map(g=>g.id));let n=1;while(used.has('vsg'+n))n++;
  const id='vsg'+n;
  let g:Gradient;
  if(kind==='linear'){
    const angle=patch.angle??(cur&&cur.kind==='linear'?angleOf(cur):0);
    g=(patch.angle===undefined&&cur&&cur.kind==='linear')?{...cur,id,stops}:{id,kind:'linear',...linearFor(angle),stops};
  }else g=cur&&cur.kind==='radial'?{...cur,id,stops}:{id,kind:'radial',cx:.5,cy:.5,r:.5,stops};
  if(!used.has(id)&&(doc.gradients?.length??0)>=GRADIENT_LIMITS.maxGradients&&!cur)throw new RangeError('too many gradients');
  const set=new Set(chosen.map(p=>p.id));
  return prune({...doc,gradients:[...(doc.gradients??[]),g],paths:doc.paths.map(p=>set.has(p.id)?{...p,style:{...p.style,[target]:gradientFill(id)}}:p)});
}
function prune(doc:VectorDocument):VectorDocument{const r=pruneGradients(doc),next={...doc,paths:r.paths};if(r.gradients)next.gradients=r.gradients;else delete next.gradients;return next;}
