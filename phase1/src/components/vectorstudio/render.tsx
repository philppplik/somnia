import type {ReactElement} from 'react';
import {serializeContour,pathArrows,textLines,textTransform,LINE_HEIGHT,type VectorText,type ArrowSpec,type Gradient,type Style,type VectorPath,fxSpec,type FxSpec} from '../../lib/vectorio';
/** SVG attributes for one path style. Absent keys follow SVG defaults (black fill, no stroke), same as the exporter. */
export function styleProps(s:Partial<Style>|undefined){
 return {fill:s?.fill??'#000000',stroke:s?.stroke??'none',strokeWidth:s?.strokeWidth??1,strokeLinecap:s?.lineCap,strokeLinejoin:s?.lineJoin,strokeMiterlimit:s?.miterLimit,
  strokeDasharray:s?.dashArray?.length?s.dashArray.join(' '):undefined,strokeDashoffset:s?.dashOffset||undefined,fillRule:s?.fillRule,
  fillOpacity:s?.fillOpacity,strokeOpacity:s?.strokeOpacity,opacity:s?.opacity,filter:fxSpec(s)?`url(#${fxSpec(s)!.id})`:undefined,style:s?.blendMode&&s.blendMode!=='normal'?{mixBlendMode:s.blendMode}:undefined};}
/** Renders paths in paint order. Subpaths that share `compound` render as one element so holes work. */
export function PathLayer({paths,page}:{paths:readonly VectorPath[];page?:{width:number;height:number}}){
 const out:{key:string;d:string;p:VectorPath}[]=[];const byCompound=new Map<string,number>();
 for(const p of paths){if(p.hidden)continue;const d=serializeContour(p.nodes,p.closed);if(!d)continue;
  const c=p.compound!==undefined?byCompound.get(p.compound):undefined;if(c!==undefined){out[c].d+=d;continue;}
  if(p.compound!==undefined)byCompound.set(p.compound,out.length);out.push({key:p.id,d,p});}
 // Mask shapes (`clip`) are not painted: they clip the other members of their group. A group without any other member paints its shape normally.
 const hasContent=new Set(out.filter(e=>!e.p.clip&&e.p.group!==undefined).map(e=>e.p.group));
 const masks=new Map<string,{d:string;evenodd:boolean}>();
 for(const e of out)if(e.p.clip&&e.p.group!==undefined&&hasContent.has(e.p.group)&&!masks.has(e.p.group))masks.set(e.p.group,{d:e.d,evenodd:e.p.style?.fillRule==='evenodd'});
 const cid=(g:string)=>'vsc-'+g.replace(/[^A-Za-z0-9_-]/g,'_');
 const nodes:ReactElement[]=[];const open:{g:string;items:ReactElement[]}[]=[];
 const flush=()=>{const r=open.pop();if(r)nodes.push(<g key={'clip:'+r.g+':'+nodes.length} clipPath={`url(#${cid(r.g)})`}>{r.items}</g>);};
 for(const e of out){
  const g=e.p.group;if(e.p.clip&&g!==undefined&&masks.has(g))continue;
  const ar=pathArrows(e.p);
  const el=<path key={e.key} d={e.d} data-path-id={e.p.id} {...styleProps(e.p.style)} markerStart={ar.start?`url(#${ar.start.id})`:undefined} markerEnd={ar.end?`url(#${ar.end.id})`:undefined}/>;
  if(g!==undefined&&masks.has(g)){if(open.length&&open[0].g!==g)flush();if(!open.length)open.push({g,items:[]});open[0].items.push(el);}else{flush();nodes.push(el);}
 }
 flush();
 const arrows=new Map<string,ArrowSpec>();for(const e of out){const a=pathArrows(e.p);for(const s of [a.start,a.end])if(s)arrows.set(s.id,s);}
 const fxs=new Map<string,FxSpec>();for(const e of out){const f=fxSpec(e.p.style);if(f)fxs.set(f.id,f);}
 const fw=page?.width??1000,fh=page?.height??1000;
 return <>{[...fxs.values()].map(f=><filter key={'fx:'+f.id} id={f.id} filterUnits="userSpaceOnUse" x={-fw} y={-fh} width={3*fw} height={3*fh} colorInterpolationFilters="sRGB">{f.blur>0&&<feGaussianBlur stdDeviation={f.blur}/>}{f.shadow&&<feDropShadow dx={f.shadow.dx} dy={f.shadow.dy} stdDeviation={f.shadow.blur} floodColor={f.shadow.color} floodOpacity={f.shadow.opacity}/>}</filter>)}{[...arrows.values()].map(a=><marker key={'m:'+a.id} id={a.id} viewBox="0 0 10 10" refX={a.refX} refY={5} markerWidth={4} markerHeight={4} orient="auto-start-reverse">{a.shape==='circle'?<circle cx={5} cy={5} r={4} fill={'#'+a.color}/>:a.filled?<path d={a.d} fill={'#'+a.color}/>:<path d={a.d} fill="none" stroke={'#'+a.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>}</marker>)}{[...masks].map(([g,m])=><clipPath key={'def:'+g} id={cid(g)}><path d={m.d} clipRule={m.evenodd?'evenodd':'nonzero'}/></clipPath>)}{nodes}</>;}

/** Document gradients as SVG paint servers (objectBoundingBox units, pad), so fills `url(#id)` resolve in the editor canvas. */
export function GradientDefs({gradients}:{gradients?:readonly Gradient[]}){
 if(!gradients?.length)return null;
 return <>{gradients.map(g=>{const stops=g.stops.map((s,i)=><stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity}/>);
  return g.kind==='linear'?<linearGradient key={g.id} id={g.id} gradientUnits="objectBoundingBox" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>{stops}</linearGradient>
   :<radialGradient key={g.id} id={g.id} gradientUnits="objectBoundingBox" cx={g.cx} cy={g.cy} r={g.r}>{stops}</radialGradient>;})}</>;}

/** Text objects, painted above all paths (same markup the exporter writes). */
export function TextLayer({texts}:{texts:readonly VectorText[]}){
 return <>{texts.map(t=><text key={t.id} data-text-id={t.id} x={t.x} y={t.y} fontFamily={t.fontFamily} fontSize={t.fontSize} fontWeight={t.fontWeight} fontStyle={t.fontStyle} textAnchor={t.anchor} fill={t.fill} opacity={t.opacity} transform={textTransform(t)} xmlSpace="preserve">
  {textLines(t).map((l,i)=><tspan key={i} x={t.x} dy={i===0?0:t.fontSize*LINE_HEIGHT}>{l}</tspan>)}</text>)}</>;}
