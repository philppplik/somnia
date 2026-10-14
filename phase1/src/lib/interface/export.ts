import {parseInterfaceDocument,serializeInterfaceDocument,type InterfaceDocument} from './model';
import {computeInterfaceLayout} from './layout';
import {resolveInterfaceValues,resolvedTextStyle} from './tokens';
const escape=(v:string)=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export interface FrameExport {documentId:string;revision:number;frameId:string;width:number;height:number;svg:string;warnings:string[];}
/** Pure immutable revision export. No external resources, arbitrary SVG or executable metadata. */
export function exportInterfaceFrame(source:InterfaceDocument,frameId:string):FrameExport{
 const original=parseInterfaceDocument(serializeInterfaceDocument(source));const resolved=resolveInterfaceValues(original),doc=resolved.document,layout=computeInterfaceLayout(doc),nodes=new Map(doc.nodes.map(n=>[n.id,n])),frame=nodes.get(frameId),bounds=layout.bounds.get(frameId);
 if(!frame||frame.kind!=='frame'||!bounds)throw Error('Select a frame to export.');if(bounds.width>8192||bounds.height>8192||bounds.width*bounds.height>16_000_000)throw Error('Frame export exceeds the 16 MP / 8192px limit.');
 const warnings=[...resolved.diagnostics,...layout.diagnostics];let clips='';
 const render=(id:string,root=false):string=>{const n=nodes.get(id)!,b=layout.bounds.get(id)!;if(n.hidden)return '';const clip=`clip-${n.id}`;if(n.kind==='frame')clips+=`<clipPath id="${clip}"><rect width="${b.width}" height="${b.height}"/></clipPath>`;let content='';
 if(n.kind==='frame'||n.kind==='rectangle')content+=`<rect width="${b.width}" height="${b.height}" fill="${n.fill}"/>`;
 if(n.kind==='text'){const style=resolvedTextStyle(doc,n);warnings.push('Text export uses system generic fonts and explicit lines; browser wrapping/font substitutions may differ.');const line=style.fontSize*style.lineHeight;content+=`<svg width="${b.width}" height="${b.height}" overflow="hidden"><text fill="${n.fill}" font-family="${style.fontFamily}" font-size="${style.fontSize}" font-weight="${style.fontWeight}" dominant-baseline="text-before-edge">${(n.text??'').split('\n').map((text,index)=>`<tspan x="0" y="${index*line}">${escape(text)}</tspan>`).join('')}</text></svg>`;}
 content+=n.children.map(child=>render(child)).join('');return `<g transform="translate(${root?0:b.x} ${root?0:b.y})"${n.kind==='frame'?` clip-path="url(#${clip})"`:''}>${content}</g>`;};
 const body=render(frameId,true);const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}"><defs>${clips}</defs>${body}</svg>`;
 return {documentId:doc.id,revision:doc.revision,frameId,width:bounds.width,height:bounds.height,svg,warnings:[...new Set(warnings)]};
}
export function buildInterfaceHandoff(source:InterfaceDocument,frameId:string){
 const doc=parseInterfaceDocument(serializeInterfaceDocument(source)),resolved=resolveInterfaceValues(doc),layout=computeInterfaceLayout(doc),root=doc.nodes.find(n=>n.id===frameId);if(!root||root.kind!=='frame')throw Error('Select a frame for handoff.');
 const nodes=new Map(resolved.document.nodes.map(n=>[n.id,n])),rows:unknown[]=[];const walk=(id:string)=>{const n=nodes.get(id)!;rows.push({id:n.id,parentId:n.parentId,name:n.name,kind:n.kind,bounds:layout.bounds.get(id),fill:n.fill,text:n.text,textStyle:n.kind==='text'?resolvedTextStyle(doc,n):undefined,bindings:n.bindings,layout:n.layout,sizing:n.sizing,component:n.instance,annotation:n.annotation??'',ready:n.ready??false,hidden:n.hidden});n.children.forEach(walk);};walk(frameId);
 return {kind:'somnia-interface-handoff',version:1,documentId:doc.id,revision:doc.revision,frameId,ready:root.ready??false,annotation:root.annotation??'',nodes:rows,variables:doc.variables??[],textStyles:doc.textStyles??[],warnings:[...new Set([...resolved.diagnostics,...layout.diagnostics,'Readiness is manually set, not an accessibility or production-quality certification.','No prototype, runtime logic or production code is included.'])]};
}
export async function frameExportPNG(frame:FrameExport):Promise<Blob>{
 if(frame.width>8192||frame.height>8192||frame.width*frame.height>16_000_000)throw Error('PNG exceeds export limit.');
 const blob=new Blob([frame.svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);
 try{const image=new Image();await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Frame rendering timed out.')),10000);image.onload=()=>{clearTimeout(timeout);resolve();};image.onerror=()=>{clearTimeout(timeout);reject(Error('Frame image could not render.'));};image.src=url;});const canvas=document.createElement('canvas');canvas.width=Math.ceil(frame.width);canvas.height=Math.ceil(frame.height);const ctx=canvas.getContext('2d');if(!ctx)throw Error('PNG renderer unavailable.');ctx.drawImage(image,0,0);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG encoding failed.')),'image/png'));}finally{URL.revokeObjectURL(url);}
}
export function downloadInterfaceBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
