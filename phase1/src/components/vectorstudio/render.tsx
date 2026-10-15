import {serializeContour,type Gradient,type Style,type VectorPath} from '../../lib/vectorio';
/** SVG attributes for one path style. Absent keys follow SVG defaults (black fill, no stroke), same as the exporter. */
export function styleProps(s:Partial<Style>|undefined){
 return {fill:s?.fill??'#000000',stroke:s?.stroke??'none',strokeWidth:s?.strokeWidth??1,strokeLinecap:s?.lineCap,strokeLinejoin:s?.lineJoin,strokeMiterlimit:s?.miterLimit,
  strokeDasharray:s?.dashArray?.length?s.dashArray.join(' '):undefined,strokeDashoffset:s?.dashOffset||undefined,fillRule:s?.fillRule,
  fillOpacity:s?.fillOpacity,strokeOpacity:s?.strokeOpacity,opacity:s?.opacity};}
/** Renders paths in paint order. Subpaths that share `compound` render as one element so holes work. */
export function PathLayer({paths}:{paths:readonly VectorPath[]}){
 const out:{key:string;d:string;p:VectorPath}[]=[];const byCompound=new Map<string,number>();
 for(const p of paths){if(p.hidden)continue;const d=serializeContour(p.nodes,p.closed);if(!d)continue;
  const c=p.compound!==undefined?byCompound.get(p.compound):undefined;if(c!==undefined){out[c].d+=d;continue;}
  if(p.compound!==undefined)byCompound.set(p.compound,out.length);out.push({key:p.id,d,p});}
 return <>{out.map(e=><path key={e.key} d={e.d} data-path-id={e.p.id} {...styleProps(e.p.style)}/>)}</>;}

/** Document gradients as SVG paint servers (objectBoundingBox units, pad), so fills `url(#id)` resolve in the editor canvas. */
export function GradientDefs({gradients}:{gradients?:readonly Gradient[]}){
 if(!gradients?.length)return null;
 return <>{gradients.map(g=>{const stops=g.stops.map((s,i)=><stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity}/>);
  return g.kind==='linear'?<linearGradient key={g.id} id={g.id} gradientUnits="objectBoundingBox" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>{stops}</linearGradient>
   :<radialGradient key={g.id} id={g.id} gradientUnits="objectBoundingBox" cx={g.cx} cy={g.cy} r={g.r}>{stops}</radialGradient>;})}</>;}
