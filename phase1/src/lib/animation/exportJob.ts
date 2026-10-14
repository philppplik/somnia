import {useSyncExternalStore} from 'react';
import {canvasRasterize,downloadBlob,exportFramePng,exportSequenceZip,ExportError,type Rasterize} from './exportFrames';
import {findComp} from './model';
import {animationSession} from './session';
/** Observable state of the one export job the studio runs at a time. The UI shows real progress and real failures; nothing reports success before the file was handed to the browser. */
export interface ExportState{status:'idle'|'running'|'done'|'error';kind:'frame'|'sequence'|null;done:number;total:number;message:string;fileName:string;transparent:boolean}
const idle:ExportState={status:'idle',kind:null,done:0,total:0,message:'',fileName:'',transparent:false};
let state=idle;let ctl:AbortController|null=null;const listeners=new Set<()=>void>();
const set=(s:Partial<ExportState>)=>{state={...state,...s};listeners.forEach(l=>l());};
export const exportState=()=>state;
export const subscribeExport=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const useExportState=()=>useSyncExternalStore(subscribeExport,exportState,exportState);
export function setExportTransparent(on:boolean){set({transparent:on});}
export function cancelExport(){ctl?.abort();}
export function resetExport(){if(state.status!=='running'){state={...idle,transparent:state.transparent};listeners.forEach(l=>l());}}
interface Deps{rasterize?:Rasterize;save?:(b:Blob,name:string)=>void}
function target(){
 const doc=animationSession().document;const comp=doc&&findComp(doc);
 if(!doc||!comp)throw new ExportError('Open an animation first.','empty');
 return {doc,comp};
}
async function guarded(kind:'frame'|'sequence',fn:(signal:AbortSignal)=>Promise<{blob:Blob;fileName:string}>,save:(b:Blob,n:string)=>void){
 if(state.status==='running')throw new ExportError('An export is already running.','cancelled');
 ctl=new AbortController();set({status:'running',kind,done:0,total:kind==='frame'?1:0,message:'',fileName:''});
 try{const r=await fn(ctl.signal);save(r.blob,r.fileName);set({status:'done',done:state.total,fileName:r.fileName});return r.fileName;}
 catch(e){const msg=e instanceof Error?e.message:String(e);set({status:'error',message:msg});throw e;}
 finally{ctl=null;}
}
export function exportCurrentFrame(d:Deps={}){
 const {doc,comp}=target();const at=animationSession().getState().view.playhead;
 return guarded('frame',()=>exportFramePng(comp,at,doc.name,d.rasterize??canvasRasterize,state.transparent,doc.assets),d.save??downloadBlob);
}
export function exportWorkAreaSequence(d:Deps={}){
 const {doc,comp}=target();
 return guarded('sequence',signal=>exportSequenceZip(comp,doc.name,{assets:doc.assets,rasterize:d.rasterize??canvasRasterize,transparent:state.transparent,signal,onProgress:(done,total)=>set({done,total})}),d.save??downloadBlob);
}
