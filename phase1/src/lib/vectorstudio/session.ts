import {reportError} from '../log';
/** Vector Studio session: one open vector document, selection, tool, view and undo history. Framework-agnostic store plus a React hook. */
import {useSyncExternalStore} from 'react';
import {exportSvg,importSvg,normalizeDoc,normalizeText,TEXT_LIMITS,gradientIdOf,checkFxPatch,isImageUri,normalizeImage,IMAGE_LIMITS,SvgImportError,type VectorImage,type Diagnostic,type Point,type Style,type VectorDocument,type VectorPath,type VectorText} from '../vectorio';
import {boxOf,fitPath,translatePath,type Box} from './geometry';
import {checkGrid,DEFAULT_GRID,type GridOptions} from './grid';
import {newId,checkShapeOptions,DEFAULT_SHAPE_OPTIONS,type ShapeOptions} from './shapes';
import {t} from '../i18n';
import {selectedPaths} from '../../components/vectorstudio/tools/operations';
export type VectorTool='select'|'node'|'pen'|'rect'|'ellipse'|'line'|'polygon'|'star'|'text';
export interface VectorSession{
 name:string;doc:VectorDocument;selection:string[];tool:VectorTool;zoom:number;pan:Point;
 dirty:boolean;canUndo:boolean;canRedo:boolean;diagnostics:Diagnostic[];error:string|null;open:boolean;
 /** Path whose nodes are shown in Node mode. */
 nodePath:string|null;selectedNode:string|null;
 /** Selected text object (texts and paths are never selected together). */
 textSel:string|null;/** Selected placed image (never together with paths or a text). */imageSel:string|null;shapeOpts:ShapeOptions;grid:GridOptions;
}
export const PAGE_PRESETS=[
 {id:'icon',label:'Icon 512',width:512,height:512},{id:'square',label:'Square 1080',width:1080,height:1080},
 {id:'a4',label:'A4 (96 dpi)',width:794,height:1123},{id:'hd',label:'HD 1920x1080',width:1920,height:1080},{id:'logo',label:'Logo 1024',width:1024,height:1024}] as const;
const HISTORY_LIMIT=200;
let past:VectorDocument[]=[],future:VectorDocument[]=[];
const fresh=():VectorSession=>({name:'Untitled.svg',doc:{width:1024,height:1024,paths:[]},selection:[],tool:'select',zoom:1,pan:{x:0,y:0},dirty:false,canUndo:false,canRedo:false,diagnostics:[],error:null,open:false,nodePath:null,selectedNode:null,textSel:null,imageSel:null,shapeOpts:DEFAULT_SHAPE_OPTIONS,grid:DEFAULT_GRID});
let state:VectorSession=fresh();
const listeners=new Set<()=>void>();
const set=(patch:Partial<VectorSession>)=>{if(patch.error)reportError('vector.engine',patch.error,{context:{studio:'vector',file:patch.name??state.name}});state={...state,...patch,canUndo:past.length>0,canRedo:future.length>0};listeners.forEach(l=>l());};
export const getVectorSession=()=>state;
export const subscribeVector=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const useVectorSession=()=>useSyncExternalStore(subscribeVector,getVectorSession,getVectorSession);
/** Test helper and "close document". */
export function resetVectorSession(){past=[];future=[];state=fresh();listeners.forEach(l=>l());}
/** Blank start: no file needed. */
export function createBlankVector(width=1024,height=1024,name='Untitled.svg'):boolean{
 if(!confirmReplacement())return false;const w=clampSize(width),h=clampSize(height);past=[];future=[];
 state={...fresh(),name,doc:{width:w,height:h,paths:[]},open:true};listeners.forEach(l=>l());return true;}
const clampSize=(n:number)=>Number.isFinite(n)?Math.min(16384,Math.max(1,Math.round(n))):1024;
/** Opens SVG source. Strict import: unsupported SVG features are shown as diagnostics instead of being dropped silently. Returns false on failure; the error stays in session.error. */
/** `confirmed`: the caller already obtained (and revalidated) approval to replace unsaved work, so no second dialog is shown. */
export function openSvgSource(source:string,name='Imported.svg',
 opts:{strict?:boolean;confirmed?:boolean}={}):boolean{
 try{const r=importSvg(source,{strict:opts.strict??true});if(!opts.confirmed&&!confirmReplacement())return false;past=[];future=[];
  state={...fresh(),name,doc:normalizeDoc(r.doc),diagnostics:r.warnings,open:true};listeners.forEach(l=>l());return true;}
 catch(e){reportError('vector.import',e,{context:{studio:'vector',file:name}});const diagnostics=e instanceof SvgImportError?e.diagnostics:[];
  set({error:e instanceof Error?e.message:String(e),diagnostics});return false;}}
const finite=(...values:number[])=>{if(!values.every(Number.isFinite))throw new RangeError('Coordinates and style numbers must be finite.');};
/** Validate before touching history or state. Do not normalise away invalid caller input. */
function validateDocument(doc:VectorDocument){
 finite(doc.width,doc.height);
 for(const g of doc.gradients??[]){for(const v of Object.values(g)){if(typeof v==='number')finite(v);}for(const s of g.stops)finite(s.offset,s.opacity);}
 for(const t of doc.texts??[])finite(t.x,t.y,t.fontSize);
 for(const i of doc.images??[])finite(i.x,i.y,i.width,i.height);
 for(const p of doc.paths){
  for(const n of p.nodes){finite(n.x,n.y);if(n.in)finite(n.in.x,n.in.y);if(n.out)finite(n.out.x,n.out.y);}
  for(const value of Object.values(p.style??{})){if(typeof value==='number')finite(value);else if(Array.isArray(value))finite(...value);}
 }
}
const selectionIds=(doc:VectorDocument,ids:readonly string[])=>selectedPaths(doc,ids).map(p=>p.id);
/** Applies a validated document change as one atomic undo step. Invalid input leaves state and history untouched. */
export function commit(next:VectorDocument,patch:Partial<VectorSession>={}){
 validateDocument(next);
 const selection=selectionIds(next,patch.selection??state.selection);
 const nodePath=patch.nodePath===undefined?state.nodePath:patch.nodePath;
 const validNodePath=next.paths.find(p=>p.id===nodePath&&!p.hidden&&!p.locked)?.id??null;
 past.push(state.doc);if(past.length>HISTORY_LIMIT)past.shift();future=[];
 const textSel=selection.length?null:(next.texts??[]).some(t=>t.id===state.textSel)?state.textSel:null;
 const imageSel=selection.length||textSel?null:(next.images??[]).some(i=>i.id===state.imageSel)?state.imageSel:null;
 set({...patch,doc:next,dirty:true,error:null,selection,textSel,imageSel,nodePath:validNodePath,selectedNode:validNodePath?(patch.selectedNode===undefined?state.selectedNode:patch.selectedNode):null});}
const liveText=(doc:VectorDocument)=>(doc.texts??[]).some(t=>t.id===state.textSel)?state.textSel:null;
const liveImage=(doc:VectorDocument)=>(doc.images??[]).some(i=>i.id===state.imageSel)?state.imageSel:null;
export function undo(){const prev=past.pop();if(!prev)return;future.push(state.doc);set({doc:prev,dirty:true,selection:selectionIds(prev,state.selection),textSel:liveText(prev),imageSel:liveImage(prev)});}
export function redo(){const next=future.pop();if(!next)return;past.push(state.doc);set({doc:next,dirty:true,selection:selectionIds(next,state.selection),textSel:liveText(next),imageSel:liveImage(next)});}
export const setTool=(tool:VectorTool)=>set({tool,nodePath:tool==='node'?state.nodePath??state.selection[0]??null:null,selectedNode:null});
export const select=(ids:string[])=>{const selection=selectionIds(state.doc,ids);set({selection,textSel:selection.length?null:state.textSel,imageSel:selection.length?null:state.imageSel,nodePath:state.tool==='node'?selectedPaths(state.doc,ids).find(p=>ids.includes(p.id))?.id??null:state.nodePath,selectedNode:null});};
/** Options for the next rectangle (corner radius), polygon (sides) and star (points, depth) drawn; not part of the document, no undo step. */
export const setShapeOptions=(o:Partial<ShapeOptions>)=>set({shapeOpts:{...state.shapeOpts,...checkShapeOptions(o)}});
export const setGrid=(o:Partial<GridOptions>)=>set({grid:{...state.grid,...checkGrid(o)}});
export const setView=(zoom:number,pan?:Point)=>{finite(zoom,...(pan?[pan.x,pan.y]:[]));set({zoom:Math.min(32,Math.max(0.05,zoom)),...(pan?{pan}:{})});};
export const clearError=()=>set({error:null,diagnostics:[]});
const mapPaths=(f:(p:VectorPath)=>VectorPath)=>(ids:readonly string[])=>({...state.doc,paths:state.doc.paths.map(p=>ids.includes(p.id)?f(p):p)});
export function addPath(p:VectorPath,select_=true){commit({...state.doc,paths:[...state.doc.paths,p]},select_?{selection:[p.id]}:{});}
export function deleteSelection(){if(!state.selection.length)return;const ids=state.selection;commit({...state.doc,paths:state.doc.paths.filter(p=>!ids.includes(p.id))},{selection:[],nodePath:null,selectedNode:null});}
export function duplicateSelection(offset=12){finite(offset);const ids=state.selection;if(!ids.length)return;
 const gmap=new Map<string,string>(),copies=remapPaths(selectedPaths(state.doc,ids).map(p=>translatePath(p,offset,offset)),state.doc,gmap);
 commit({...state.doc,paths:[...state.doc.paths,...copies],...carryNames(state.doc.groupNames,state.doc.groupNames,gmap)},{selection:copies.map(c=>c.id)});}
export const moveSelection=(dx:number,dy:number)=>{finite(dx,dy);if(state.selection.length&&(dx||dy))commit(mapPaths(p=>translatePath(p,dx,dy))(state.selection));};
export function setStyle(patch:Partial<Style>,ids:readonly string[]=state.selection){const chosen=selectionIds(state.doc,ids);if(!chosen.length)return;checkFxPatch(patch as Record<string,unknown>);const have=new Set((state.doc.gradients??[]).map(g=>g.id)),gid=gradientIdOf(patch.fill);if(typeof patch.fill==='string'&&patch.fill.startsWith('url(')&&(gid===undefined||!have.has(gid))){patch={...patch};delete patch.fill;if(!Object.keys(patch).length)return;}commit(mapPaths(p=>({...p,style:{...p.style,...patch}}))(chosen));}
export function renameGroup(group:string,name:string){
 if(!state.doc.paths.some(p=>p.group===group))return;
 const names={...(state.doc.groupNames??{})},n=name.trim().slice(0,80);if(n)names[group]=n;else delete names[group];
 const {groupNames:_old,...rest}=state.doc;commit(Object.keys(names).length?{...rest,groupNames:names}:rest);}
export function renamePath(id:string,name:string){commit(mapPaths(p=>({...p,name}))([id]));}
export function toggleHidden(id:string){const target=state.doc.paths.find(p=>p.id===id);if(!target)return;const ids=state.doc.paths.filter(p=>p.id===id||(target.compound!==undefined&&p.compound===target.compound)).map(p=>p.id);commit(mapPaths(p=>{const {hidden:_h,...rest}=p;return target.hidden?rest:{...rest,hidden:true as const};})(ids));}
/** z-order: 'front'|'back'|'forward'|'backward'. */
export function reorder(mode:'front'|'back'|'forward'|'backward',ids:readonly string[]=state.selection){
 ids=selectionIds(state.doc,ids);const paths=[...state.doc.paths];const chosen=paths.filter(p=>ids.includes(p.id));if(!chosen.length)return;
 let out:VectorPath[];
 if(mode==='front')out=[...paths.filter(p=>!ids.includes(p.id)),...chosen];
 else if(mode==='back')out=[...chosen,...paths.filter(p=>!ids.includes(p.id))];
 else{out=paths;const dir=mode==='forward'?1:-1;const order=dir===1?[...paths.keys()].reverse():[...paths.keys()];
  for(const i of order){if(!ids.includes(out[i].id))continue;const j=i+dir;if(j<0||j>=out.length||ids.includes(out[j].id))continue;out=[...out];[out[i],out[j]]=[out[j],out[i]];}}
 if(out.every((p,i)=>p===paths[i]))return;commit({...state.doc,paths:out});}
/** Sets the selection bounds (x,y,w,h) in document units; w/h > 0. */
export function setSelectionBounds(b:{x?:number;y?:number;w?:number;h?:number}){
 finite(...Object.values(b).filter((v):v is number=>v!==undefined));const sel=selectedPaths(state.doc,state.selection);const box=boxOf(sel);if(!box)return;
 const to:Box={minX:b.x??box.minX,minY:b.y??box.minY,maxX:(b.x??box.minX)+(b.w??box.maxX-box.minX),maxY:(b.y??box.minY)+(b.h??box.maxY-box.minY)};
 if(to.maxX-to.minX<=0||to.maxY-to.minY<=0)return;commit(mapPaths(p=>fitPath(p,box,to))(state.selection));}
export function resizePage(width:number,height:number){finite(width,height);commit({...state.doc,width:clampSize(width),height:clampSize(height)});}
/** Node editing (Node tool). Moves one node and its handles together. */
export function moveNode(pathId:string,nodeId:string,to:Point,part:'anchor'|'in'|'out'='anchor'){
 finite(to.x,to.y);commit(mapPaths(p=>({...p,nodes:p.nodes.map(n=>{if(n.id!==nodeId)return n;
  if(part==='anchor'){const dx=to.x-n.x,dy=to.y-n.y;return {...n,x:to.x,y:to.y,...(n.in?{in:{x:n.in.x+dx,y:n.in.y+dy}}:{}),...(n.out?{out:{x:n.out.x+dx,y:n.out.y+dy}}:{})};}
  const other=part==='in'?'out':'in';const mirror=n[other]&&n.kind!=='corner'?{[other]:mirrorHandle(n,to,n.kind==='symmetric')}:{};
  return {...n,[part]:to,...mirror};})}))([pathId]));}
function mirrorHandle(n:{x:number;y:number;in?:Point;out?:Point},to:Point,equal:boolean){
 const dx=n.x-to.x,dy=n.y-to.y;const other=(n.in&&Math.hypot(n.in.x-n.x,n.in.y-n.y))||(n.out&&Math.hypot(n.out.x-n.x,n.out.y-n.y))||Math.hypot(dx,dy);
 const l=Math.hypot(dx,dy)||1,len=equal?l:other;return {x:n.x+dx/l*len,y:n.y+dy/l*len};}
export function deleteNode(pathId:string,nodeId:string){
 const p=state.doc.paths.find(q=>q.id===pathId);if(!p)return;
 if(p.nodes.length<=2){commit({...state.doc,paths:state.doc.paths.filter(q=>q.id!==pathId)},{selection:[],nodePath:null,selectedNode:null});return;}
 commit(mapPaths(q=>({...q,nodes:q.nodes.filter(n=>n.id!==nodeId)}))([pathId]),{selectedNode:null});}
export function setNodeKind(pathId:string,nodeId:string,kind:'corner'|'smooth'|'symmetric'){
 commit(mapPaths(p=>({...p,nodes:p.nodes.map(n=>{if(n.id!==nodeId)return n;if(kind==='corner')return {...n,kind};
  if(n.in&&n.out)return {...n,kind};const ref=n.out??n.in;const r=ref?{x:n.x*2-ref.x,y:n.y*2-ref.y}:{x:n.x+40,y:n.y};const a=n.in?n.in:{x:n.x-(r.x-n.x),y:n.y-(r.y-n.y)};const b=n.out?n.out:{x:r.x,y:r.y};
  return {...n,kind,in:n.in??a,out:n.out??(ref?{x:ref.x,y:ref.y}:b)};})}))([pathId]));}
export function toggleClosed(pathId:string){commit(mapPaths(p=>({...p,closed:!p.closed}))([pathId]));}
export const markVectorSaved=()=>set({dirty:false});
export const toSvg=()=>exportSvg(normalizeDoc(state.doc));
export const SVG_MIME='image/svg+xml';
import {insertNode,nearestOnPath} from './geometry';
/** Adds a node on the outline of a path near `pt` (document units). Returns the new node id or null when the click is too far away. */
export function addNodeNear(pathId:string,pt:Point,maxDistance=8):string|null{
 finite(pt.x,pt.y,maxDistance);const p=state.doc.paths.find(q=>q.id===pathId);if(!p)return null;const hit=nearestOnPath(p,pt);if(!hit||hit.distance>maxDistance)return null;
 const id=newId('n');commit(mapPaths(q=>insertNode(q,hit.segment,hit.t,id))([pathId]),{selectedNode:id});return id;}
/** Replaces the whole document as one undo step (used by SVG import into an open document). */
export function replaceDocument(doc:VectorDocument,patch:Partial<VectorSession>={}){validateDocument(doc);commit(normalizeDoc(doc),{selection:[],nodePath:null,selectedNode:null,...patch});}
/** Imported gradients get fresh ids so they cannot collide with (or silently replace) the open document's gradients. */
function mergeGradients(doc:VectorDocument,imported:VectorDocument,paths:VectorPath[]){
 if(!imported.gradients?.length)return{paths,gradients:doc.gradients};
 const used=new Set((doc.gradients??[]).map(g=>g.id)),map=new Map<string,string>();let n=1;
 const fresh=()=>{while(used.has('vsg'+n))n++;const id='vsg'+n;used.add(id);return id;};
 const add=imported.gradients.map(g=>{const id=fresh();map.set(g.id,id);return{...g,id};});
 return{paths:paths.map(p=>{const gid=gradientIdOf(p.style?.fill),to=gid?map.get(gid):undefined;return to?{...p,style:{...p.style,fill:`url(#${to})`}}:p;}),gradients:[...(doc.gradients??[]),...add]};
}
/** Imports SVG source into the open document as additional paths. Returns false on error (see session.error). */
export function importSvgInto(source:string,opts:{strict?:boolean;offset?:number}={}):boolean{
 try{const r=importSvg(source,{strict:opts.strict??true}),off=opts.offset??0;finite(off);const gmap=new Map<string,string>(),add=remapPaths(off?r.doc.paths.map(p=>translatePath(p,off,off)):r.doc.paths,state.doc,gmap);
  const merged=mergeGradients(state.doc,r.doc,add);
  const have=state.doc.texts??[],inc=(r.doc.texts??[]).map(t=>({...t,id:newId('t'),x:t.x+off,y:t.y+off}));
  if(have.length+inc.length>TEXT_LIMITS.maxTexts)throw new RangeError(`At most ${TEXT_LIMITS.maxTexts} text objects`);
  const texts=[...have,...inc];
  commit({...state.doc,paths:[...state.doc.paths,...merged.paths],...(texts.length?{texts}:{}),...(merged.gradients?{gradients:merged.gradients}:{}),...carryNames(state.doc.groupNames,r.doc.groupNames,gmap)},{selection:add.map(p=>p.id),diagnostics:r.warnings});
  if(!add.length&&inc.length)set({textSel:inc[inc.length-1].id});return true;}
 catch(e){set({error:e instanceof Error?e.message:String(e),diagnostics:e instanceof SvgImportError?e.diagnostics:[]});return false;}}
export const selectNode=(id:string|null)=>set({selectedNode:id});

/** Allocate fresh identities in every space; preserve compound membership only within this batch. */
/** Group names follow their group through a duplicate or an import (ids are remapped). */
function carryNames(base:Record<string,string>|undefined,from:Record<string,string>|undefined,map:Map<string,string>):{groupNames?:Record<string,string>}{
 const out={...(base??{})};for(const [old,id] of map){const n=from?.[old];if(n)out[id]=n;}
 return Object.keys(out).length?{groupNames:out}:{};
}
function remapPaths(paths:readonly VectorPath[],doc:VectorDocument,groupMap?:Map<string,string>):VectorPath[]{
 const used=new Set(doc.paths.flatMap(p=>[p.id,...p.nodes.map(n=>n.id),...(p.compound===undefined?[]:[p.compound]),...(p.group===undefined?[]:[p.group])]));
 const allocate=(prefix:string)=>{let id:string;do{id=newId(prefix);}while(used.has(id));used.add(id);return id;};
 const compounds=new Map<string,string>(),groups=new Map<string,string>();
 return paths.map(p=>{
  const copy={...p,id:allocate('p'),nodes:p.nodes.map(n=>({...n,id:allocate('n')}))};
  if(p.compound!==undefined){let id=compounds.get(p.compound);if(id===undefined){id=allocate('c');compounds.set(p.compound,id);}copy.compound=id;}
  if(p.group!==undefined){let id=groups.get(p.group);if(id===undefined){id=allocate('g');groups.set(p.group,id);}copy.group=id;groupMap?.set(p.group,id);}
  return copy;
 });
}

/** Cancellation keeps the entire session and its undo/redo history, including the current name. */
function confirmReplacement():boolean{
 return !state.open||!state.dirty||typeof window==='undefined'||window.confirm(t('vector.discardEdits',{name:state.name}));
}
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{
 if(!state.open||!state.dirty)return;event.preventDefault();event.returnValue='';
});

/** Text objects. Each call is one undo step; invalid input throws before history is touched. */
export const selectText=(id:string|null)=>{if(id!==null&&!(state.doc.texts??[]).some(t=>t.id===id))return;set({textSel:id,...(id!==null?{selection:[],imageSel:null,nodePath:null,selectedNode:null}:{})});};
export function addText(p:{x:number;y:number;text?:string}&Partial<Omit<VectorText,'id'|'text'|'x'|'y'>>):string{
 finite(p.x,p.y);const id=newId('t');
 const t=normalizeText({fontFamily:'sans-serif',fontSize:Math.max(12,Math.round(Math.min(state.doc.width,state.doc.height)/20)),...p,id,text:p.text??'Text'});
 if(!t)throw new RangeError('Text must not be empty');
 if((state.doc.texts??[]).length>=200)throw new RangeError('At most 200 text objects');
 commit({...state.doc,texts:[...(state.doc.texts??[]),t]},{selection:[]});set({textSel:id,imageSel:null});return id;}
export function updateText(id:string,patch:Partial<Omit<VectorText,'id'>>){
 const cur=(state.doc.texts??[]).find(t=>t.id===id);if(!cur)throw new Error('Unknown text: '+id);
 finite(...[patch.x,patch.y,patch.fontSize].filter((v):v is number=>v!==undefined));
 const next=normalizeText({...cur,...patch});if(!next)throw new RangeError('Text must not be empty');
 commit({...state.doc,texts:(state.doc.texts??[]).map(t=>t.id===id?next:t)});}
/** Copy of one text, offset like a path duplicate, selected afterwards. One undo step; returns the new id. */
export function duplicateText(id:string,offset=12):string{
 finite(offset);const cur=(state.doc.texts??[]).find(t=>t.id===id);if(!cur)throw new Error('Unknown text: '+id);
 if((state.doc.texts??[]).length>=TEXT_LIMITS.maxTexts)throw new RangeError(`At most ${TEXT_LIMITS.maxTexts} text objects`);
 const nid=newId('t');commit({...state.doc,texts:[...(state.doc.texts??[]),{...cur,id:nid,x:cur.x+offset,y:cur.y+offset}]},{selection:[]});set({textSel:nid,imageSel:null});return nid;}
export function deleteText(id:string){
 if(!(state.doc.texts??[]).some(t=>t.id===id))throw new Error('Unknown text: '+id);
 const rest=(state.doc.texts??[]).filter(t=>t.id!==id),{texts:_t,...doc}=state.doc;commit(rest.length?{...doc,texts:rest}:doc);set({textSel:state.textSel===id?null:state.textSel});}

/** Placed images (reference layers behind everything). Each call is one undo step; invalid input throws before history is touched. */
export const selectImage=(id:string|null)=>{if(id!==null&&!(state.doc.images??[]).some(i=>i.id===id))return;set({imageSel:id,...(id!==null?{selection:[],textSel:null,nodePath:null,selectedNode:null}:{})});};
export function placeImage(p:{href:string;width:number;height:number;x?:number;y?:number}):string{
 if(!isImageUri(p.href))throw new RangeError(`Image must be a base64 PNG, JPEG or WebP of at most ${IMAGE_LIMITS.maxUriChars} characters`);
 finite(p.width,p.height,p.x??0,p.y??0);
 if(p.width<IMAGE_LIMITS.minSize||p.height<IMAGE_LIMITS.minSize||p.width>IMAGE_LIMITS.maxSize||p.height>IMAGE_LIMITS.maxSize)throw new RangeError(`Image size must be ${IMAGE_LIMITS.minSize}-${IMAGE_LIMITS.maxSize}`);
 const have=state.doc.images??[];
 if(have.length>=IMAGE_LIMITS.maxImages)throw new RangeError(`At most ${IMAGE_LIMITS.maxImages} images`);
 if(have.reduce((n,i)=>n+i.href.length,0)+p.href.length>IMAGE_LIMITS.maxTotalChars)throw new RangeError('Placed images are too large in total');
 const id=newId('i'),im=normalizeImage({id,href:p.href,width:p.width,height:p.height,x:p.x??0,y:p.y??0});
 if(!im)throw new RangeError('Invalid image');
 commit({...state.doc,images:[...have,im]},{selection:[]});set({imageSel:id,textSel:null});return id;}
export function updateImage(id:string,patch:Partial<Pick<VectorImage,'x'|'y'|'width'|'height'|'opacity'>>){
 const cur=(state.doc.images??[]).find(i=>i.id===id);if(!cur)throw new Error('Unknown image: '+id);
 const keys=Object.keys(patch);if(keys.some(k=>!['x','y','width','height','opacity'].includes(k)))throw new RangeError('Unknown image field');
 for(const v of Object.values(patch))finite(v as number);
 const next=normalizeImage({...cur,...patch});if(!next)throw new RangeError('Invalid image');
 commit({...state.doc,images:(state.doc.images??[]).map(i=>i.id===id?next:i)});}
export function deleteImage(id:string){
 if(!(state.doc.images??[]).some(i=>i.id===id))throw new Error('Unknown image: '+id);
 const rest=(state.doc.images??[]).filter(i=>i.id!==id),{images:_i,...doc}=state.doc;commit(rest.length?{...doc,images:rest}:doc);}
