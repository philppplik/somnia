/** Editing operations for the inline SVG editor. Every edit is a source splice committed through the editor core. */
import {applyOperations,getState} from '../../store/appStore';
import {scanSvg,elementAt,attr,attrPatches,applyPatches,removePatch,blockRange,lineInfo,insertChild,pathKey,parsePathKey,escapeText,escapeValue,isAncestor,type XEl,type Patch} from './source';
import {changesForDelta,invert,mul,apply,rotateAbout,scaleAbout,alignDelta,unionBox,I,translate,type Matrix,type Box,type AlignKind} from './geometry';
import {pathToContours} from './pathnodes';
import {parseTransform} from '../vectorio/matrix';
import {getUi,patchUi} from './store';

export const view:{svg:SVGSVGElement|null}={svg:null};
export const file=()=>getState().activeFile;
export const sourceText=()=>getState().files[file()]??'';
let cache:{text:string;root:XEl|null;error:string}|null=null;
export function scan():{root:XEl|null;error:string;text:string}{const text=sourceText();if(!cache||cache.text!==text){const r=scanSvg(text);cache={text,root:r.ok?r.root:null,error:r.ok?'':r.error};}return cache;}
const notice=(m:string)=>patchUi({notice:m});
export function commit(text:string,selection?:string[]):boolean{
 const r=scanSvg(text);if(!r.ok){notice(`Edit rejected: ${r.error}`);return false;}
 if(text===sourceText()){if(selection)patchUi({selection});return true;}
 try{applyOperations([{type:'replaceSource',file:file(),text}],'canvas');}catch(e){notice(String(e));return false;}
 patchUi({selection:selection??getUi().selection.filter(k=>!!elementAt(r.root,parsePathKey(k))),notice:''});return true;}

// ---- DOM geometry -------------------------------------------------------------------------------------------
const toM=(m:DOMMatrix):Matrix=>[m.a,m.b,m.c,m.d,m.e,m.f];
export const domEl=(key:string):SVGGraphicsElement|null=>view.svg?(key===''?view.svg:view.svg.querySelector(`[data-sp="${key}"]`)):null;
export const rootCTM=():Matrix=>{const m=view.svg?.getScreenCTM();return m?toM(m):I;};
export const clientToRoot=(x:number,y:number)=>apply(invert(rootCTM()),x,y);
export const rootToClient=(x:number,y:number)=>apply(rootCTM(),x,y);
const parentKey=(key:string)=>pathKey(parsePathKey(key).slice(0,-1));
export function keyToRoot(key:string):Matrix{ // coordinate system established by element `key` (its own transform included), as map to root space
 if(key==='')return I;const el=domEl(key);const m=el?.getScreenCTM();return m?mul(invert(rootCTM()),toM(m)):I;}
export const parentToRoot=(key:string)=>keyToRoot(parentKey(key));
export function boxOfEl(el:Element):Box{const r=el.getBoundingClientRect();const a=clientToRoot(r.left,r.top),b=clientToRoot(r.right,r.bottom);return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)};}
export const boxOfKey=(key:string)=>{const e=domEl(key);return e?boxOfEl(e):null;};
export const boxOfKeys=(keys:string[])=>unionBox(keys.map(boxOfKey).filter((b):b is Box=>!!b));
/** Drop keys that sit inside another selected key. */
export const topKeys=(keys:string[])=>{const ps=keys.map(parsePathKey);return keys.filter((_,i)=>!ps.some((q,j)=>j!==i&&isAncestor(q,ps[i])));};
export const docOrder=(keys:string[])=>[...keys].sort((a,b)=>{const x=parsePathKey(a),y=parsePathKey(b);for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]??-1)!==(y[i]??-1))return(x[i]??-1)-(y[i]??-1);}return 0;});
const src=(el:XEl)=>({tag:el.tag.replace(/^.*:/,''),get:(n:string)=>attr(el,n)});
const LEAF=new Set(['path','rect','circle','ellipse','line','polyline','polygon','text','use','image']);
export const isLeaf=(el:XEl)=>LEAF.has(el.tag.replace(/^.*:/,''));
export const label=(el:XEl,idx:number)=>attr(el,'id')||attr(el,'data-name')||`${el.tag}${el.parent?` ${idx+1}`:''}`;

// ---- transforms ---------------------------------------------------------------------------------------------
export function deltaPatches(text:string,root:XEl,deltas:Array<{key:string;delta:Matrix}>,ptr:(key:string)=>Matrix=parentToRoot):Patch[]{
 const out:Patch[]=[];for(const {key,delta} of deltas){const el=elementAt(root,parsePathKey(key));if(!el||!el.parent)continue;out.push(...attrPatches(el,changesForDelta(src(el),delta,ptr(key)),text));}return out;}
export function transformKeys(keys:string[],delta:Matrix):boolean{
 const {root,text}=scan();if(!root)return false;const ks=topKeys(keys).filter(k=>!getUi().locked.includes(k));if(!ks.length)return false;
 return commit(applyPatches(text,deltaPatches(text,root,ks.map(key=>({key,delta})))));}
export function align(keys:string[],kind:AlignKind):boolean{
 const ks=topKeys(keys);const boxes=ks.map(k=>({k,b:boxOfKey(k)})).filter((x):x is {k:string;b:Box}=>!!x.b);if(!boxes.length)return false;
 const vb=docBox();const target=boxes.length>1?unionBox(boxes.map(x=>x.b))!:vb;const {root,text}=scan();if(!root)return false;
 return commit(applyPatches(text,deltaPatches(text,root,boxes.map(x=>({key:x.k,delta:alignDelta(x.b,target,kind)})))));}
export function docBox():Box{const svg=view.svg;const vb=svg?.viewBox.baseVal;if(vb&&vb.width)return{x:vb.x,y:vb.y,w:vb.width,h:vb.height};return{x:0,y:0,w:300,h:150};}
export function rotateSel(keys:string[],deg:number){const b=boxOfKeys(topKeys(keys));if(!b)return;transformKeys(keys,rotateAbout(deg,b.x+b.w/2,b.y+b.h/2));}
export function flipSel(keys:string[],axis:'h'|'v'){const b=boxOfKeys(topKeys(keys));if(!b)return;transformKeys(keys,axis==='h'?scaleAbout(-1,1,b.x+b.w/2,0):scaleAbout(1,-1,0,b.y+b.h/2));}

// ---- paint --------------------------------------------------------------------------------------------------
function paintChanges(el:XEl,prop:string,value:string|null):Record<string,string|null>{
 const st=attr(el,'style');
 if(st&&new RegExp(`(^|;)\\s*${prop}\\s*:`).test(st)){
  const next=value===null?st.replace(new RegExp(`(^|;)\\s*${prop}\\s*:[^;]*;?`),'$1').replace(/^;|;$/g,''):st.replace(new RegExp(`((?:^|;)\\s*${prop}\\s*:)[^;]*`),`$1${value}`);
  return{style:next.trim()?next:null};}
 return{[prop]:value};}
export function setPaint(keys:string[],props:Record<string,string|null>):boolean{
 const {root,text}=scan();if(!root)return false;const patches:Patch[]=[];const seen=new Set<XEl>();
 const visit=(el:XEl)=>{if(seen.has(el))return;seen.add(el);if(isLeaf(el)||!el.children.length){for(const [p,v] of Object.entries(props)){patches.push(...attrPatches(el,paintChanges(el,p,v),text));}return;}el.children.forEach(visit);};
 for(const k of topKeys(keys)){const el=elementAt(root,parsePathKey(k));if(el&&el.parent)visit(el);}
 // several props on one element produce several attr patches; merge by applying in one pass per element
 return commit(mergeAndApply(text,patches));}
function mergeAndApply(text:string,patches:Patch[]):string{ // insertions at the same position must concatenate in order
 const ins=new Map<number,string>();const rest:Patch[]=[];
 for(const p of patches){if(p.from===p.to&&p.insert){ins.set(p.from,(ins.get(p.from)??'')+p.insert);}else rest.push(p);}
 for(const [at,s] of ins)rest.push({from:at,to:at,insert:s});return applyPatches(text,rest);}
export function setAttrOn(key:string,changes:Record<string,string|null>):boolean{const {root,text}=scan();if(!root)return false;const el=elementAt(root,parsePathKey(key));if(!el)return false;return commit(applyPatches(text,attrPatches(el,changes,text)));}
export function setAttrOnMany(keys:string[],changes:Record<string,string|null>):boolean{const {root,text}=scan();if(!root)return false;const p:Patch[]=[];for(const k of topKeys(keys)){const el=elementAt(root,parsePathKey(k));if(el&&el.parent)p.push(...attrPatches(el,changes,text));}return commit(mergeAndApply(text,p));}
export function readPaint(el:XEl,prop:string):string|undefined{const st=attr(el,'style');const m=st&&new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(st);return m?m[1].trim():attr(el,prop);}

// ---- structure ----------------------------------------------------------------------------------------------
export function remove(keys:string[]):boolean{const {root,text}=scan();if(!root)return false;const p:Patch[]=[];for(const k of topKeys(keys)){const el=elementAt(root,parsePathKey(k));if(el&&el.parent)p.push(removePatch(text,el));}if(!p.length)return false;return commit(applyPatches(text,p),[]);}
export function duplicate(keys:string[],offset=10):boolean{
 const {root,text}=scan();if(!root)return false;const ks=docOrder(topKeys(keys));const p:Patch[]=[];const sel:string[]=[];const counts=new Map<string,number>();
 for(const k of ks){const path=parsePathKey(k);const el=elementAt(root,path);if(!el||!el.parent)continue;const r=blockRange(text,el);const own=r.to>el.to||r.from<el.from;
  const block=text.slice(r.from,r.to);p.push({from:r.to,to:r.to,insert:own?block:text.slice(el.from,el.to)});
  const pk=pathKey(path.slice(0,-1));const n=(counts.get(pk)??0)+1;counts.set(pk,n);sel.push(pathKey([...path.slice(0,-1),path[path.length-1]+n]));}
 if(!p.length)return false;
 // Place the copies, then nudge them so they are visible.
 let next=applyPatches(text,p);const r2=scanSvg(next);if(!r2.ok)return commit(next,sel);
 const dp=deltaPatches(next,r2.root,sel.map(key=>({key,delta:translate(offset,offset)})));return commit(applyPatches(next,dp),sel);}
const REORDER=(order:number[],pick:Set<number>,mode:'front'|'forward'|'backward'|'back')=>{
 const a=[...order];const sel=a.filter(i=>pick.has(i)),rest=a.filter(i=>!pick.has(i));
 if(mode==='front')return[...rest,...sel];if(mode==='back')return[...sel,...rest];
 const out=[...a];
 if(mode==='forward'){for(let i=out.length-2;i>=0;i--)if(pick.has(out[i])&&!pick.has(out[i+1]))[out[i],out[i+1]]=[out[i+1],out[i]];}
 else{for(let i=1;i<out.length;i++)if(pick.has(out[i])&&!pick.has(out[i-1]))[out[i],out[i-1]]=[out[i-1],out[i]];}
 return out;};
export function reorder(keys:string[],mode:'front'|'forward'|'backward'|'back'):boolean{
 const {root,text}=scan();if(!root)return false;const ks=topKeys(keys).map(parsePathKey).filter(p=>p.length);if(!ks.length)return false;
 const parentP=ks[0].slice(0,-1);if(!ks.every(p=>pathKey(p.slice(0,-1))===pathKey(parentP))){notice('Select elements from one group to change their order.');return false;}
 const parent=elementAt(root,parentP)!;const idx=ks.map(p=>p[p.length-1]);const order=parent.children.map((_,i)=>i);
 const next=REORDER(order,new Set(idx),mode);if(next.every((v,i)=>v===i))return true;
 const slots=parent.children.map(c=>blockRange(text,c));const blocks=parent.children.map((_c,i)=>text.slice(slots[i].from,slots[i].to));
 // keep the original trailing newline pattern per slot
 const fix=(b:string,slot:number)=>{const wantNl=text.slice(slots[slot].from,slots[slot].to).endsWith('\n');const hasNl=b.endsWith('\n');return wantNl&&!hasNl?b+'\n':!wantNl&&hasNl?b.replace(/\r?\n$/,''):b;};
 const patches=slots.map((s,slot)=>({from:s.from,to:s.to,insert:fix(blocks[next[slot]],slot)}));
 const newSel=idx.map(i=>pathKey([...parentP,next.indexOf(i)]));return commit(applyPatches(text,patches),newSel);}
const stepOf=(indent:string)=>indent.includes('\t')?'\t':'  ';
const reindentBlock=(s:string,from:string,to:string)=>s.split('\n').map(l=>l.startsWith(from)?to+l.slice(from.length):l).join('\n');
export function group(keys:string[]):boolean{
 const {root,text}=scan();if(!root)return false;const ks=docOrder(topKeys(keys)).map(parsePathKey).filter(p=>p.length);if(!ks.length)return false;
 const pp=pathKey(ks[0].slice(0,-1));if(!ks.every(p=>pathKey(p.slice(0,-1))===pp)){notice('Select elements from one group to group them.');return false;}
 const els=ks.map(p=>elementAt(root,p)!);const first=els[0];const {indent}=lineInfo(text,first.from);const step=stepOf(indent);
 const body=els.map(e=>indent+step+reindentBlock(text.slice(e.from,e.to),lineInfo(text,e.from).indent,indent+step).replace(/^\s+/,'')).join('\n');
 const g=`<g>\n${body}\n${indent}</g>`;const patches:Patch[]=[];
 els.forEach((e,i)=>{if(i===0){const r=blockRange(text,e);const own=r.to>e.to||r.from<e.from;patches.push({from:own?r.from:e.from,to:own?r.to:e.to,insert:own?indent+g+'\n':g});}else patches.push(removePatch(text,e));});
 return commit(applyPatches(text,patches),[pathKey([...ks[0].slice(0,-1),ks[0][ks[0].length-1]])]);}
export function ungroup(key:string):boolean{
 let {root,text}=scan();if(!root)return false;const p=parsePathKey(key);const g=elementAt(root,p);if(!g||g.tag!=='g'||!g.parent)return false;
 const odd=g.attrs.filter(a=>!['id','transform','data-name','class'].includes(a.name)&&!a.name.startsWith('data-'));
 if(odd.length||attr(g,'class')){notice('This group carries its own style or class, ungrouping would change how its content looks.');return false;}
 const gt=attr(g,'transform');
 if(gt&&parseTransform(gt)){const M=parseTransform(gt)!;const patches:Patch[]=[];for(const c of g.children){patches.push(...attrPatches(c,changesForDelta(src(c),M,I),text));}
  // changesForDelta composes M*child in the group's parent frame, which is what removing the group needs
  text=applyPatches(text,patches);const r=scanSvg(text);if(!r.ok)return false;root=r.root;}
 else if(gt){notice('Cannot read the transform of this group.');return false;}
 const g2=elementAt(root,p)!;if(g2.selfClosing)return remove([key]);
 const {indent}=lineInfo(text,g2.from);const inner=text.slice(g2.startEnd,g2.endFrom);
 const childIndent=g2.children.length?lineInfo(text,g2.children[0].from).indent:indent+stepOf(indent);
 const trimmed=inner.replace(/^\s*\n/,'').replace(/\n[ \t]*$/,'');const body=reindentBlock(trimmed,childIndent,indent);
 const r=blockRange(text,g2);const own=r.to>g2.to||r.from<g2.from;
 const next=applyPatches(text,[{from:own?r.from:g2.from,to:own?r.to:g2.to,insert:own?body+'\n':body.trim()}]);
 const base=p.slice(0,-1);const n=g2.children.length;return commit(next,Array.from({length:n},(_,i)=>pathKey([...base,p[p.length-1]+i])));}
export function toggleHidden(key:string){const {root}=scan();const el=root&&elementAt(root,parsePathKey(key));if(!el)return;setAttrOn(key,{display:attr(el,'display')==='none'?null:'none'});}
export function toggleLock(key:string){const l=getUi().locked;patchUi({locked:l.includes(key)?l.filter(k=>k!==key):[...l,key]});}
export function renameElement(key:string,name:string){setAttrOn(key,{id:name.trim()||null});}

// ---- creating -----------------------------------------------------------------------------------------------
const f=(n:number)=>String(Math.round(n*1000)/1000);
export function paintAttrs(fill:string,stroke:string,sw:number){const a:string[]=[];a.push(`fill="${escapeValue(fill)}"`);if(stroke!=='none'){a.push(`stroke="${escapeValue(stroke)}"`);a.push(`stroke-width="${f(sw)}"`);}return a.join(' ');}
/** Insert `elementSrc` as the last child of the group at `parentKey` (root by default) and select it. */
export function addElement(elementSrc:string,parentKeyStr=''):boolean{
 const {root,text}=scan();if(!root)return false;const parent=elementAt(root,parsePathKey(parentKeyStr));if(!parent)return false;
 const idx=parent.children.length;return commit(insertChild(text,parent,null,elementSrc),[pathKey([...parsePathKey(parentKeyStr),idx])]);}
export function insertionParent():string{const {root}=scan();const k=getUi().selection.length===1?getUi().selection[0]:'';const el=root&&elementAt(root,parsePathKey(k));return el&&el.tag==='g'?k:'';}
export const rectSrc=(x:number,y:number,w:number,h:number,d=getUi().draw)=>`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" ${paintAttrs(d.fill,d.stroke,d.strokeWidth)}/>`;
export const ellipseSrc=(cx:number,cy:number,rx:number,ry:number,d=getUi().draw)=>`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" ${paintAttrs(d.fill,d.stroke,d.strokeWidth)}/>`;
export const lineSrc=(x1:number,y1:number,x2:number,y2:number,d=getUi().draw)=>`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ${paintAttrs('none',d.stroke==='none'?'#1f2430':d.stroke,d.strokeWidth)}/>`;
export function pathSrc(dd:string,closed:boolean,d=getUi().draw){const stroke=d.stroke==='none'&&!closed?'#1f2430':d.stroke;return `<path d="${dd}" ${paintAttrs(closed?d.fill:'none',stroke,d.strokeWidth)}/>`;}
export const textSrc=(x:number,y:number,s:string,size:number,d=getUi().draw)=>`<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" font-family="sans-serif" fill="${escapeValue(d.fill==='none'?'#1f2430':d.fill)}">${escapeText(s)}</text>`;
export function setTextContent(key:string,s:string):boolean{
 const {root,text}=scan();if(!root)return false;const el=elementAt(root,parsePathKey(key));if(!el||el.tag!=='text')return false;
 if(el.children.length){notice('This text has several runs. Edit it in the Code tab.');return false;}
 if(el.selfClosing)return commit(applyPatches(text,[{from:el.startEnd-2,to:el.startEnd,insert:`>${escapeText(s)}</${el.tag}>`}]));
 return commit(applyPatches(text,[{from:el.startEnd,to:el.endFrom,insert:escapeText(s)}]));}
export const textOf=(el:XEl,text:string)=>el.selfClosing||el.children.length?'':text.slice(el.startEnd,el.endFrom).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
export function replaceElementSource(key:string,s:string):boolean{
 const {root,text}=scan();if(!root)return false;const el=elementAt(root,parsePathKey(key));if(!el)return false;
 const frag=scanSvg(`<svg xmlns="http://www.w3.org/2000/svg">${s}</svg>`);if(!frag.ok||frag.root.children.length!==1){notice(frag.ok?'The code must hold exactly one element.':`Code rejected: ${frag.error}`);return false;}
 return commit(applyPatches(text,[{from:el.from,to:el.to,insert:s.trim()}]));}
export function setDocument(p:{width?:string;height?:string;viewBox?:string}):boolean{const {root}=scan();if(!root)return false;const ch:Record<string,string|null>={};for(const [k,v] of Object.entries(p))if(v!==undefined)ch[k]=v.trim()||null;return setAttrOn('',ch);}

// ---- shape to path ------------------------------------------------------------------------------------------
const K=0.5522847498;
export function shapeD(el:XEl):string|null{
 const n=(k:string)=>{const v=parseFloat(attr(el,k)??'0');return Number.isFinite(v)?v:0;};
 switch(el.tag){
  case'rect':{const x=n('x'),y=n('y'),w=n('width'),h=n('height');let rx=attr(el,'rx')!==undefined?n('rx'):n('ry'),ry=attr(el,'ry')!==undefined?n('ry'):rx;rx=Math.min(rx,w/2);ry=Math.min(ry,h/2);
   if(!rx||!ry)return `M${f(x)} ${f(y)}L${f(x+w)} ${f(y)}L${f(x+w)} ${f(y+h)}L${f(x)} ${f(y+h)}Z`;
   const kx=rx*K,ky=ry*K;return `M${f(x+rx)} ${f(y)}L${f(x+w-rx)} ${f(y)}C${f(x+w-rx+kx)} ${f(y)} ${f(x+w)} ${f(y+ry-ky)} ${f(x+w)} ${f(y+ry)}L${f(x+w)} ${f(y+h-ry)}C${f(x+w)} ${f(y+h-ry+ky)} ${f(x+w-rx+kx)} ${f(y+h)} ${f(x+w-rx)} ${f(y+h)}L${f(x+rx)} ${f(y+h)}C${f(x+rx-kx)} ${f(y+h)} ${f(x)} ${f(y+h-ry+ky)} ${f(x)} ${f(y+h-ry)}L${f(x)} ${f(y+ry)}C${f(x)} ${f(y+ry-ky)} ${f(x+rx-kx)} ${f(y)} ${f(x+rx)} ${f(y)}Z`;}
  case'circle':case'ellipse':{const cx=n('cx'),cy=n('cy');const rx=el.tag==='circle'?n('r'):n('rx'),ry=el.tag==='circle'?n('r'):n('ry');const kx=rx*K,ky=ry*K;
   return `M${f(cx+rx)} ${f(cy)}C${f(cx+rx)} ${f(cy+ky)} ${f(cx+kx)} ${f(cy+ry)} ${f(cx)} ${f(cy+ry)}C${f(cx-kx)} ${f(cy+ry)} ${f(cx-rx)} ${f(cy+ky)} ${f(cx-rx)} ${f(cy)}C${f(cx-rx)} ${f(cy-ky)} ${f(cx-kx)} ${f(cy-ry)} ${f(cx)} ${f(cy-ry)}C${f(cx+kx)} ${f(cy-ry)} ${f(cx+rx)} ${f(cy-ky)} ${f(cx+rx)} ${f(cy)}Z`;}
  case'line':return `M${f(n('x1'))} ${f(n('y1'))}L${f(n('x2'))} ${f(n('y2'))}`;
  case'polygon':case'polyline':{const nums=(attr(el,'points')??'').match(/-?[\d.]+(?:e-?\d+)?/gi)?.map(Number)??[];if(nums.length<4)return null;let d='';for(let i=0;i+1<nums.length;i+=2)d+=(i?'L':'M')+`${f(nums[i])} ${f(nums[i+1])}`;return d+(el.tag==='polygon'?'Z':'');}
 }return null;}
const GEOM=new Set(['x','y','width','height','rx','ry','cx','cy','r','x1','y1','x2','y2','points']);
export const convertible=(el:XEl)=>['rect','circle','ellipse','line','polygon','polyline'].includes(el.tag);
export function convertToPath(key:string):boolean{
 const {root,text}=scan();if(!root)return false;const el=elementAt(root,parsePathKey(key));if(!el||!convertible(el))return false;const d=shapeD(el);if(!d)return false;
 const keep=el.attrs.filter(a=>!GEOM.has(a.name)).map(a=>text.slice(a.from,a.to));
 const open=`<path d="${d}"${keep.length?' '+keep.join(' '):''}${el.tag==='line'||el.tag==='polyline'?'':''}/>`;
 return commit(applyPatches(text,[{from:el.from,to:el.to,insert:open}]));}
export function setPathData(key:string,d:string):boolean{return setAttrOn(key,{d});}
export const contoursOf=(el:XEl)=>el.tag==='path'?pathToContours(attr(el,'d')??''):null;

// ---- snapping targets ---------------------------------------------------------------------------------------
/** Boxes (root space) of visible, unlocked leaf elements outside `exclude`, used as snap targets. Capped so huge documents stay responsive. */
export function snapTargets(exclude:string[],cap=400):Box[]{
 const svg=view.svg;const {root}=scan();if(!svg||!root)return[];const ex=exclude.map(parsePathKey);const out:Box[]=[];
 for(const el of Array.from(svg.querySelectorAll('[data-sp]'))){if(out.length>=cap)break;const key=el.getAttribute('data-sp')!;if(!key)continue;
  const sp=elementAt(root,parsePathKey(key));if(!sp||!isLeaf(sp))continue;
  if(el.closest('defs,clipPath,mask,pattern,symbol,marker,linearGradient,radialGradient,filter'))continue;
  const p=parsePathKey(key);if(ex.some(q=>q.length<=p.length&&q.every((v,i)=>p[i]===v)))continue;
  if(getComputedStyle(el).display==='none')continue;const b=boxOfEl(el);if(b.w===0&&b.h===0)continue;out.push(b);}
 return out;}
