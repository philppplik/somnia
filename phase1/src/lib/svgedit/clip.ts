/** Clipping paths and masks for the inline SVG editor. The topmost selected shape becomes the clip or mask; the rest is wrapped in a group that points at it. */
import * as C from './controller';
import {scanSvg,elementAt,attr,parsePathKey,pathKey,walk,lineInfo,elementSource,insertChild,applyPatches,removePatch,setAttrs,type XEl,type Patch} from './source';
import {patchUi} from './store';

export type ClipKind='clip'|'mask';
export const CLIP_SHAPES=new Set(['rect','circle','ellipse','path','polygon','polyline','line']);
const notice=(m:string)=>patchUi({notice:m});
const attrName=(k:ClipKind)=>k==='clip'?'clip-path':'mask';
const url=(id:string)=>`url(#${id})`;
const refId=(v:string|undefined)=>{const m=v&&/^\s*url\(\s*['"]?#([^'")\s]+)['"]?\s*\)\s*$/.exec(v);return m?m[1]:null;};
const findById=(root:XEl,id:string)=>{let r:XEl|null=null;walk(root,e=>{if(!r&&attr(e,'id')===id)r=e;});return r as XEl|null;};
const uniqueId=(root:XEl,base:string)=>{let n=1;while(findById(root,`${base}${n}`))n++;return `${base}${n}`;};

/** Which clip or mask an element points at, if any (only `clip-path`/`mask` attributes are read). */
export function clipInfo(el:XEl):{kind:ClipKind;id:string}|null{
 const c=refId(attr(el,'clip-path'));if(c)return{kind:'clip',id:c};
 const m=refId(attr(el,'mask'));if(m)return{kind:'mask',id:m};return null;}

/** Whether `keys` can become clip/mask: 2+ siblings, topmost one is a plain shape. */
export function canClip(keys:string[]):boolean{
 const {root}=C.scan();if(!root)return false;const ks=C.docOrder(C.topKeys(keys)).map(parsePathKey);
 if(ks.length<2||ks.some(p=>!p.length))return false;
 const pp=pathKey(ks[0].slice(0,-1));if(!ks.every(p=>pathKey(p.slice(0,-1))===pp))return false;
 const top=elementAt(root,ks[ks.length-1]);return !!top&&CLIP_SHAPES.has(top.tag);}

export function makeClip(keys:string[],kind:ClipKind):boolean{
 const {root,text}=C.scan();if(!root)return false;
 const ks=C.docOrder(C.topKeys(keys)).map(parsePathKey);
 if(ks.length<2){notice('Select the shape to use and at least one object to clip. The topmost selected shape becomes the clip.');return false;}
 const pp=pathKey(ks[0].slice(0,-1));if(!ks.every(p=>pathKey(p.slice(0,-1))===pp)){notice('Select elements from one group to clip them.');return false;}
 const els=ks.map(p=>elementAt(root,p)!);const maskEl=els[els.length-1];const rest=els.slice(0,-1);
 if(!CLIP_SHAPES.has(maskEl.tag)){notice('The topmost selected element must be a shape (rectangle, ellipse, path, polygon) to act as the clip.');return false;}
 if(rest.some(e=>e.tag==='defs')||els.some(e=>!!e.parent&&['defs','clipPath','mask'].includes(e.parent.tag))){notice('Defs content cannot be clipped.');return false;}
 const id=uniqueId(root,kind==='clip'?'clip':'mask');
 const first=rest[0];const {indent}=lineInfo(text,first.from);const inner=indent+'  ';
 const body=rest.map(e=>inner+elementSource(text,e,inner).replace(/^\s+/,'')).join('\n');
 const g=`<g ${attrName(kind)}="${url(id)}">\n${body}\n${indent}</g>`;
 const patches:Patch[]=[];
 rest.forEach((e,i)=>{if(i===0){const r=blockRange(text,e);const own=r.to>e.to||r.from<e.from;patches.push({from:own?r.from:e.from,to:own?r.to:e.to,insert:own?indent+g+'\n':g});}else patches.push(removePatch(text,e));});
 patches.push(removePatch(text,maskEl));
 const shape=text.slice(maskEl.from,maskEl.to).replace(/\s*\n\s*/g,' ');
 const def=kind==='clip'?`<clipPath id="${id}">${shape}</clipPath>`:`<mask id="${id}">${shape}</mask>`;
 let out=applyPatches(text,patches);const r=scanSvg(out);if(!r.ok){notice('Could not build the clip: '+r.error);return false;}
 let sel=pathKey(ks[0]);const defs=r.root.children.find(c=>c.tag==='defs')??null;
 if(defs)out=insertChild(out,defs,null,def);
 else{out=insertChild(out,r.root,r.root.children[0]??null,`<defs>${def}</defs>`);const p=ks[0].slice();p[0]+=1;sel=pathKey(p);}
 return C.commit(out,[sel]);}
import {blockRange} from './source';

/** Undo a clip or mask: the shapes inside come back as visible siblings after the element, the reference is removed and the def too when nothing else uses it. */
export function releaseClip(key:string):boolean{
 const {root,text}=C.scan();if(!root)return false;const p=parsePathKey(key);const el=elementAt(root,p);if(!el||!el.parent)return false;
 const info=clipInfo(el);if(!info){notice('This element has no clip or mask to release.');return false;}
 const def=findById(root,info.id);const want=info.kind==='clip'?'clipPath':'mask';
 if(!def||def.tag!==want){notice('The clip or mask this element points at was not found in the document.');return false;}
 if(attr(def,'clipPathUnits')==='objectBoundingBox'||attr(def,'maskContentUnits')==='objectBoundingBox'){notice('This clip uses bounding-box units, releasing it would move the shapes. Edit the code instead.');return false;}
 if(!def.children.length){notice('The clip is empty.');return false;}
 const parent=el.parent;const idx=parent.children.indexOf(el);const next=parent.children[idx+1]??null;
 const {indent}=lineInfo(text,el.from);
 const src=def.children.map(c=>elementSource(text,c,indent)).join('\n'+indent);
 let out=insertChild(text,parent,next,src);
 let r=scanSvg(out);if(!r.ok)return false;
 out=setAttrs(out,elementAt(r.root,p)!,{[attrName(info.kind)]:null});
 r=scanSvg(out);if(!r.ok)return false;
 const left=out.split(url(info.id)).length-1;let sel=key;
 if(left===0){const d=findById(r.root,info.id)!;const holder=d.parent;
  if(holder&&holder.tag==='defs'&&holder.children.length===1&&holder.parent===r.root){const di=r.root.children.indexOf(holder);out=applyPatches(out,[removePatch(out,holder)]);if(di<p[0]){const q=p.slice();q[0]-=1;sel=pathKey(q);}}
  else out=applyPatches(out,[removePatch(out,d)]);}
 return C.commit(out,[sel]);}
