/** Linear and radial gradient editing. Gradients live in <defs> as normal SVG; fills point at them with url(#id). */
import {elementAt,parsePathKey,attr,walk,applyPatches,insertChild,escapeValue,attrPatches,type XEl,type Patch,scanSvg} from './source';
import * as C from './controller';
export interface Stop{offset:number;color:string;opacity:number}
export interface Grad{type:'linear'|'radial';angle:number;stops:Stop[]}
export const DEFAULT_GRAD:Grad={type:'linear',angle:0,stops:[{offset:0,color:'#6d5ef5',opacity:1},{offset:1,color:'#ee00ff',opacity:1}]};
const f=(n:number)=>String(Math.round(n*10000)/10000);
export const urlId=(v:string|undefined)=>{const m=v&&/^url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)$/.exec(v.trim());return m?m[1]:null;};
export function findById(root:XEl,id:string):XEl|null{let hit:XEl|null=null;walk(root,e=>{if(!hit&&attr(e,'id')===id)hit=e;});return hit;}
const num=(v:string|undefined,d:number)=>{if(v===undefined)return d;const n=parseFloat(v)/(v.trim().endsWith('%')?100:1);return Number.isFinite(n)?n:d;};
export function readGradient(root:XEl,id:string):Grad|null{
 const g=findById(root,id);if(!g||(g.tag!=='linearGradient'&&g.tag!=='radialGradient'))return null;
 let src=g;const href=attr(g,'href')??attr(g,'xlink:href');if(!g.children.length&&href?.startsWith('#')){const h=findById(root,href.slice(1));if(h)src=h;}
 const stops:Stop[]=src.children.filter(c=>c.tag==='stop').map(s=>{const st=attr(s,'style')??'';const sc=/stop-color\s*:\s*([^;]+)/.exec(st)?.[1]?.trim()??attr(s,'stop-color')??'#000000';const so=/stop-opacity\s*:\s*([^;]+)/.exec(st)?.[1]??attr(s,'stop-opacity');return{offset:num(attr(s,'offset'),0),color:sc,opacity:so===undefined?1:num(so,1)};});
 if(stops.length<2)return null;
 if(g.tag==='radialGradient')return{type:'radial',angle:0,stops};
 const x1=num(attr(g,'x1'),0),y1=num(attr(g,'y1'),0),x2=num(attr(g,'x2'),1),y2=num(attr(g,'y2'),0);
 return{type:'linear',angle:Math.round(Math.atan2(y2-y1,x2-x1)*180/Math.PI),stops};}
export function gradientSource(id:string,g:Grad):string{
 const stops=g.stops.map(s=>`<stop offset="${f(s.offset)}" stop-color="${escapeValue(s.color)}"${s.opacity<1?` stop-opacity="${f(s.opacity)}"`:''}/>`).join('');
 if(g.type==='radial')return `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient>`;
 const r=g.angle*Math.PI/180,dx=Math.cos(r)/2,dy=Math.sin(r)/2;
 return `<linearGradient id="${id}" x1="${f(.5-dx)}" y1="${f(.5-dy)}" x2="${f(.5+dx)}" y2="${f(.5+dy)}">${stops}</linearGradient>`;}
const sortStops=(g:Grad):Grad=>({...g,stops:[...g.stops].map(s=>({...s,offset:Math.min(1,Math.max(0,s.offset))})).sort((a,b)=>a.offset-b.offset)});
function uniqueId(root:XEl,base:string){let n=1;while(findById(root,`${base}${n}`))n++;return `${base}${n}`;}
/** One commit: write the gradient into defs (new, or in place when `reuse` points at one) and point the fill of every key at it. */
export type PaintProp='fill'|'stroke';
export function applyGradient(keys:string[],grad:Grad,reuse?:string|null,prop:PaintProp='fill'):boolean{
 const g=sortStops(grad);let {root,text}=C.scan();if(!root)return false;
 const ks=C.topKeys(keys);if(!ks.length)return false;
 const existing=reuse&&findById(root,reuse);
 if(existing&&(existing.tag==='linearGradient'||existing.tag==='radialGradient')){
  return C.commit(applyPatches(text,[{from:existing.from,to:existing.to,insert:gradientSource(reuse!,g)}]));}
 const id=uniqueId(root,'grad');
 // 1. fills
 const fp:Patch[]=[];for(const k of ks){const el=elementAt(root,parsePathKey(k));if(!el||!el.parent)continue;
  const walkLeaf=(e:XEl)=>{if(C.isLeaf(e)||!e.children.length)fp.push(...attrPatches(e,paintChange(e,`url(#${id})`,prop),text));else e.children.forEach(walkLeaf);};walkLeaf(el);}
 text=applyPatches(text,fp);const r=scanSvg(text);if(!r.ok)return false;root=r.root;
 // 2. defs
 let defs=root.children.find(c=>c.tag==='defs')??null;
 let sel=ks;
 if(!defs){text=insertChild(text,root,root.children[0]??null,`<defs>${gradientSource(id,g)}</defs>`);sel=ks.map(k=>{const p=parsePathKey(k);p[0]+=1;return p.join('.');});}
 else text=insertChild(text,defs,null,gradientSource(id,g));
 return C.commit(text,sel);}
function paintChange(el:XEl,value:string,prop:PaintProp='fill'):Record<string,string|null>{
 const st=attr(el,'style');if(st&&new RegExp(`(^|;)\\s*${prop}\\s*:`).test(st))return{style:st.replace(new RegExp(`((?:^|;)\\s*${prop}\\s*:)[^;]*`),`$1${value}`)};return{[prop]:value};}
export const solidFill=(keys:string[],color:string,prop:PaintProp='fill')=>C.setPaint(keys,{[prop]:color});
