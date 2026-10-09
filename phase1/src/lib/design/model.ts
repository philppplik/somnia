/** Versioned, local-first layout documents. Measurements are CSS pixels. */
export type DesignNode = {id:string;kind:'rectangle'|'text';name:string;x:number;y:number;width:number;height:number;fill:string;text:string;fontSize:number;radius:number;hidden:boolean;locked:boolean};
export type Artboard = {id:string;name:string;width:number;height:number;background:string;nodes:DesignNode[]};
export type DesignDocument = {format:'somnia-design';version:1;name:string;artboards:Artboard[]};
const color=/^#[0-9a-f]{6}$/i;
export const uid=()=>globalThis.crypto?.randomUUID?.()??`design-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function createArtboard(name='Artboard 1',width=960,height=640):Artboard{return {id:uid(),name,width,height,background:'#ffffff',nodes:[]};}
export function createDesignDocument():DesignDocument{return {format:'somnia-design',version:1,name:'Untitled design',artboards:[createArtboard()]};}
export function createNode(kind:DesignNode['kind'],index=0):DesignNode{return {id:uid(),kind,name:kind==='text'?'Text':'Rectangle',x:64+index*16,y:64+index*16,width:kind==='text'?320:240,height:kind==='text'?80:160,fill:kind==='text'?'#202027':'#7756e8',text:kind==='text'?'Your next idea':'',fontSize:32,radius:kind==='text'?0:16,hidden:false,locked:false};}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid design document.');return value as Record<string,unknown>;}
function str(value:unknown,max=10000):string{if(typeof value!=='string'||value.length>max)throw new Error('Invalid text field.');return value;}
function number(value:unknown,min:number,max:number):number{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error('Invalid numeric field.');return value;}
function paint(value:unknown):string{const result=str(value,7);if(!color.test(result))throw new Error('Use a six-digit hex color.');return result;}
/** Rebuild from a whitelist: imported JSON cannot inject markup or arbitrary props. */
export function parseDesignDocument(source:string):DesignDocument{
 if(source.length>5_000_000)throw new Error('Design files must be under 5 MB.');
 const d=record(JSON.parse(source));if(d.format!=='somnia-design'||d.version!==1||!Array.isArray(d.artboards)||!d.artboards.length||d.artboards.length>100)throw new Error('Unsupported design format or artboard count.');
 const ids=new Set<string>();const id=(value:unknown)=>{const result=str(value,200);if(!result||ids.has(result))throw new Error('Layer and artboard IDs must be unique.');ids.add(result);return result;};
 return {format:'somnia-design',version:1,name:str(d.name,200),artboards:d.artboards.map(value=>{const a=record(value);if(!Array.isArray(a.nodes)||a.nodes.length>1000)throw new Error('An artboard supports up to 1,000 layers.');return {id:id(a.id),name:str(a.name,200),width:number(a.width,1,16384),height:number(a.height,1,16384),background:paint(a.background),nodes:a.nodes.map(value=>{const n=record(value);if(n.kind!=='text'&&n.kind!=='rectangle')throw new Error('Unsupported layer type.');if(typeof n.hidden!=='boolean'||typeof n.locked!=='boolean')throw new Error('Invalid layer flags.');return {id:id(n.id),kind:n.kind,name:str(n.name,200),x:number(n.x,-32768,32768),y:number(n.y,-32768,32768),width:number(n.width,1,16384),height:number(n.height,1,16384),fill:paint(n.fill),text:str(n.text),fontSize:number(n.fontSize,1,512),radius:number(n.radius,0,8192),hidden:n.hidden,locked:n.locked};})};})};
}
export const serializeDesignDocument=(doc:DesignDocument)=>JSON.stringify(parseDesignDocument(JSON.stringify(doc)),null,2);
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
/** Standalone SVG of one artboard; never includes scripts or external references. */
export function exportArtboardSVG(board:Artboard):string{
 const a=parseDesignDocument(JSON.stringify({format:'somnia-design',version:1,name:'Export',artboards:[board]})).artboards[0];
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${a.width}" height="${a.height}" viewBox="0 0 ${a.width} ${a.height}"><title>${escape(a.name)}</title><rect width="100%" height="100%" fill="${a.background}"/>${a.nodes.filter(n=>!n.hidden).map(n=>n.kind==='rectangle'?`<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${n.radius}" fill="${n.fill}"/>`:`<svg x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" overflow="hidden"><text fill="${n.fill}" font-size="${n.fontSize}" font-family="sans-serif">${n.text.split('\n').map((line,i)=>`<tspan x="0" y="${(i+1)*n.fontSize*1.2}">${escape(line)}</tspan>`).join('')}</text></svg>`).join('')}</svg>`;
}
