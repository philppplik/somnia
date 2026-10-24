import {uid,type Artboard,type DesignDocument,type DesignNode} from './model';
/**
 * Pure helpers for artboards, the document palette and layer stacking. Every function takes a document (or a board)
 * and returns a new one; the session layer (artboardActions.ts) applies the result as ONE undo step.
 */
export const MAX_ARTBOARDS=100;
export const MAX_LAYERS=1000;
export interface ArtboardPreset{id:string;width:number;height:number;/** English fallback, `design.preset.<id>` wins */label:string}
/** Common sizes in CSS pixels. */
export const ARTBOARD_PRESETS:readonly ArtboardPreset[]=[
 {id:'social',width:1080,height:1080,label:'Social post'},
 {id:'story',width:1080,height:1920,label:'Story'},
 {id:'slide',width:1920,height:1080,label:'Slide 16:9'},
 {id:'desktop',width:1440,height:900,label:'Desktop'},
 {id:'tablet',width:820,height:1180,label:'Tablet'},
 {id:'mobile',width:390,height:844,label:'Mobile'},
 {id:'a4',width:794,height:1123,label:'A4 portrait'},
 {id:'letter',width:816,height:1056,label:'US Letter'},
];
export const presetById=(id:string)=>ARTBOARD_PRESETS.find(p=>p.id===id);
/** Name of the preset that exactly matches a size (either orientation is not matched on purpose), or null. */
export function presetFor(width:number,height:number):string|null{return ARTBOARD_PRESETS.find(p=>p.width===width&&p.height===height)?.id??null;}
const clampSize=(n:number)=>Math.min(16384,Math.max(1,Math.round(n*100)/100));
export function nextArtboardName(doc:DesignDocument):string{
 const names=new Set(doc.artboards.map(a=>a.name));
 for(let i=doc.artboards.length+1;i<doc.artboards.length+MAX_ARTBOARDS+2;i++){const n=`Artboard ${i}`;if(!names.has(n))return n;}
 return `Artboard ${uid().slice(0,4)}`;
}
export function addArtboard(doc:DesignDocument,opts:{name?:string;width?:number;height?:number;background?:string}={}):{doc:DesignDocument;id:string|null}{
 if(doc.artboards.length>=MAX_ARTBOARDS)return {doc,id:null};
 const board:Artboard={id:uid(),name:opts.name??nextArtboardName(doc),width:clampSize(opts.width??960),height:clampSize(opts.height??640),background:opts.background??'#ffffff',nodes:[]};
 return {doc:{...doc,artboards:[...doc.artboards,board]},id:board.id};
}
/** Copies an artboard right behind the original. Layers get fresh ids. */
export function duplicateArtboard(doc:DesignDocument,id:string):{doc:DesignDocument;id:string|null}{
 const i=doc.artboards.findIndex(a=>a.id===id);if(i<0||doc.artboards.length>=MAX_ARTBOARDS)return {doc,id:null};
 const src=doc.artboards[i];const copy:Artboard={...src,id:uid(),name:`${src.name} copy`.slice(0,200),nodes:src.nodes.map(n=>({...n,id:uid()}))};
 const artboards=[...doc.artboards];artboards.splice(i+1,0,copy);return {doc:{...doc,artboards},id:copy.id};
}
/** The last remaining artboard cannot be deleted. Returns the id that should become active. */
export function deleteArtboard(doc:DesignDocument,id:string):{doc:DesignDocument;next:string|null}{
 const i=doc.artboards.findIndex(a=>a.id===id);if(i<0||doc.artboards.length<=1)return {doc,next:null};
 const artboards=doc.artboards.filter(a=>a.id!==id);return {doc:{...doc,artboards},next:artboards[Math.min(i,artboards.length-1)].id};
}
export function renameArtboard(doc:DesignDocument,id:string,name:string):DesignDocument{
 const n=name.trim().slice(0,200);if(!n)return doc;return {...doc,artboards:doc.artboards.map(a=>a.id===id?{...a,name:n}:a)};
}
export function moveArtboard(doc:DesignDocument,id:string,direction:1|-1):DesignDocument{
 const i=doc.artboards.findIndex(a=>a.id===id),j=i+direction;if(i<0||j<0||j>=doc.artboards.length)return doc;
 const artboards=[...doc.artboards];[artboards[i],artboards[j]]=[artboards[j],artboards[i]];return {...doc,artboards};
}
/** Resizes the artboard only; layers keep their position. */
export function resizeArtboard(doc:DesignDocument,id:string,width:number,height:number):DesignDocument{
 if(!Number.isFinite(width)||!Number.isFinite(height))return doc;
 return {...doc,artboards:doc.artboards.map(a=>a.id===id?{...a,width:clampSize(width),height:clampSize(height)}:a)};
}
export const swapArtboardOrientation=(doc:DesignDocument,id:string)=>{const a=doc.artboards.find(x=>x.id===id);return a?resizeArtboard(doc,id,a.height,a.width):doc;};
export function setArtboardBackground(doc:DesignDocument,id:string,background:string):DesignDocument{
 if(!/^#[0-9a-f]{6}$/i.test(background))return doc;return {...doc,artboards:doc.artboards.map(a=>a.id===id?{...a,background:background.toLowerCase()}:a)};
}
/** Smallest zoom (0.1..4, rounded to 1%) that shows the whole artboard inside a viewport with padding. */
export function fitZoom(board:Pick<Artboard,'width'|'height'>,viewport:{width:number;height:number},padding=80):number{
 const w=Math.max(1,viewport.width-padding*2),h=Math.max(1,viewport.height-padding*2);
 const z=Math.min(w/board.width,h/board.height);return Math.min(4,Math.max(0.1,Math.floor(z*100)/100));
}
export interface PaletteEntry{color:string;uses:number;/** where it appears */roles:readonly('fill'|'stroke'|'background')[]}
/** Colours used on the artboard (background, fills, strokes), most used first, ties by first appearance. */
export function documentPalette(board:Artboard):PaletteEntry[]{
 const map=new Map<string,{uses:number;roles:Set<'fill'|'stroke'|'background'>;order:number}>();
 const add=(c:string|null,role:'fill'|'stroke'|'background')=>{if(!c)return;const k=c.toLowerCase();const e=map.get(k)??{uses:0,roles:new Set(),order:map.size};e.uses++;e.roles.add(role);map.set(k,e);};
 add(board.background,'background');
 for(const n of board.nodes){add(n.fill,'fill');if(n.strokeWidth>0)add(n.stroke,'stroke');}
 return [...map.entries()].sort((a,b)=>b[1].uses-a[1].uses||a[1].order-b[1].order).map(([color,e])=>({color,uses:e.uses,roles:[...e.roles]}));
}
export type StackMove='front'|'back'|'forward'|'backward';
/** Reorders the given (unlocked) layers inside one artboard. The array is bottom to top, like the model. */
export function restack(nodes:readonly DesignNode[],ids:readonly string[],move:StackMove):DesignNode[]{
 const sel=new Set(nodes.filter(n=>ids.includes(n.id)&&!n.locked).map(n=>n.id));if(!sel.size)return [...nodes];
 const rest=nodes.filter(n=>!sel.has(n.id)),picked=nodes.filter(n=>sel.has(n.id));
 if(move==='front')return [...rest,...picked];
 if(move==='back')return [...picked,...rest];
 const out=[...nodes];
 if(move==='forward'){for(let i=out.length-2;i>=0;i--)if(sel.has(out[i].id)&&!sel.has(out[i+1].id))[out[i],out[i+1]]=[out[i+1],out[i]];}
 else{for(let i=1;i<out.length;i++)if(sel.has(out[i].id)&&!sel.has(out[i-1].id))[out[i],out[i-1]]=[out[i-1],out[i]];}
 return out;
}
/** Moves unlocked layers by a delta, clamped to the model range. */
export function nudgeNodes(nodes:readonly DesignNode[],ids:readonly string[],dx:number,dy:number):DesignNode[]{
 const c=(n:number)=>Math.max(-32768,Math.min(32768,n));
 return nodes.map(n=>ids.includes(n.id)&&!n.locked?{...n,x:c(n.x+dx),y:c(n.y+dy)}:n);
}
/** Statistics shown in the Document section. */
export function documentStats(doc:DesignDocument){return {artboards:doc.artboards.length,layers:doc.artboards.reduce((s,a)=>s+a.nodes.length,0),hidden:doc.artboards.reduce((s,a)=>s+a.nodes.filter(n=>n.hidden).length,0),locked:doc.artboards.reduce((s,a)=>s+a.nodes.filter(n=>n.locked).length,0)};}
