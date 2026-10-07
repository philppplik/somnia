import {convertFile,type ConvertOptions} from './engine';
import {detectFormat,formatLabel,TARGETS,type FormatId} from './formats';
/** Where converted files go. Folder, zip download and single downloads all implement this. */
export interface OutputSink{
 /** Does a file with this name already exist at the destination? */
 has(name:string):Promise<boolean>|boolean;
 write(name:string,bytes:Uint8Array,mime:string):Promise<void>;
 /** Called once after all files; zip/download sinks flush here. */
 finish?():Promise<void>;
}
export interface BatchItem{id:string;name:string;bytes:Uint8Array;format:FormatId}
export type ItemState='queued'|'running'|'done'|'failed'|'skipped'|'cancelled';
export interface ItemProgress{id:string;state:ItemState;error?:string;outputName?:string;warnings?:string[]}
export interface BatchSummary{done:number;failed:number;skipped:number;cancelled:number;items:ItemProgress[]}
/** "a.png" taken -> "a (2).png". Case-insensitive because Windows and macOS folders are. */
export async function uniqueName(name:string,sink:Pick<OutputSink,'has'>,taken:Set<string>):Promise<string>{
 const dot=name.lastIndexOf('.');const stem=dot>0?name.slice(0,dot):name;const ext=dot>0?name.slice(dot):'';
 let n=1;let cand=name;
 while(taken.has(cand.toLowerCase())||await sink.has(cand)){n+=1;cand=`${stem} (${n})${ext}`;if(n>9999)throw Error('Too many files with the same name');}
 taken.add(cand.toLowerCase());return cand;}
export interface BatchOptions extends ConvertOptions{target:FormatId;sink:OutputSink;signal?:AbortSignal;onProgress?:(p:ItemProgress,summary:{finished:number;total:number})=>void}
/** Convert items one by one (bounded memory, steady progress). A failing file never stops the others. */
export async function runBatch(items:readonly BatchItem[],o:BatchOptions):Promise<BatchSummary>{
 const progress=new Map<string,ItemProgress>(items.map(i=>[i.id,{id:i.id,state:'queued'}]));
 const taken=new Set<string>();let finished=0;
 const set=(p:ItemProgress)=>{progress.set(p.id,p);if(p.state!=='running'&&p.state!=='queued')finished+=1;o.onProgress?.(p,{finished,total:items.length});};
 for(const it of items){
  if(o.signal?.aborted){set({id:it.id,state:'cancelled'});continue;}
  if(!TARGETS[it.format].includes(o.target)){set({id:it.id,state:'skipped',error:`${formatLabel(it.format)} cannot become ${formatLabel(o.target)}`});continue;}
  o.onProgress?.({id:it.id,state:'running'},{finished,total:items.length});
  try{
   const r=await convertFile(it.name,it.bytes,it.format,o.target,o);
   if(o.signal?.aborted){set({id:it.id,state:'cancelled'});continue;}
   const name=await uniqueName(r.name,o.sink,taken);
   await o.sink.write(name,r.bytes,r.mime);
   set({id:it.id,state:'done',outputName:name,warnings:r.warnings});
  }catch(e){set({id:it.id,state:'failed',error:e instanceof Error?e.message:String(e)});}
 }
 const list=items.map(i=>progress.get(i.id)!);
 const count=(s:ItemState)=>list.filter(p=>p.state===s).length;
 if(list.some(p=>p.state==='done'))await o.sink.finish?.();
 return {done:count('done'),failed:count('failed'),skipped:count('skipped'),cancelled:count('cancelled'),items:list};}
/** Read a File into a batch item. Rejects files over the per-file cap so the UI stays responsive. */
export const MAX_FILE_BYTES=200*1024*1024;export const MAX_BATCH_FILES=100;
export async function toBatchItem(file:{name:string;size:number;arrayBuffer():Promise<ArrayBuffer>},id:string):Promise<BatchItem>{
 if(file.size>MAX_FILE_BYTES)throw Error('File is larger than 200 MB');
 const bytes=new Uint8Array(await file.arrayBuffer());return {id,name:file.name,bytes,format:detectFormat(file.name,bytes)};}
