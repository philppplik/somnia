/** Eager model guardrails, shared by folder indexing and reads. No paths are silently truncated. */
export const MAX_PROJECT_DOCUMENTS=2048;
export const MAX_PROJECT_FILES=20_000;
export const MAX_PROJECT_DEPTH=32;
export const MAX_PROJECT_TEXT_BYTES=64*1024*1024;
export const isEditablePath=(path:string)=>/\.(html?|css|js|json|svg|txt|md)$/i.test(path);
export interface ProjectRow{path:string;name:string;depth:number;dir:boolean}
export function indexProjectRows(paths:readonly string[]):ProjectRow[]{
 const rows:ProjectRow[]=[];const seen=new Set<string>();
 for(const path of [...paths].sort((a,b)=>a.localeCompare(b))){const parts=path.split('/');let prefix='';parts.forEach((name,i)=>{prefix=prefix?prefix+'/'+name:name;const dir=i<parts.length-1;if(!dir||!seen.has(prefix)){rows.push({path:prefix,name,depth:i,dir});if(dir)seen.add(prefix);}});}
 return rows;
}
/** Bounded parallel reads with cooperative yields. Waits for every worker before rejecting so the caller can safely close the candidate port. */
export async function readProjectDocuments<T extends {content:string|null;revision:unknown}>(paths:readonly string[],read:(path:string)=>Promise<T>,yieldControl:()=>Promise<void>=()=>new Promise(r=>setTimeout(r,0))){
 const editable=paths.filter(isEditablePath).sort();
 if(editable.length>MAX_PROJECT_DOCUMENTS)throw Error(`Project contains ${editable.length} text documents; the limit is ${MAX_PROJECT_DOCUMENTS}. The current project was kept.`);
 const results=new Map<string,T>();let cursor=0,bytes=0,completed=0;let error:unknown;let failed=false;
 const worker=async()=>{try{while(!failed){const i=cursor++;if(i>=editable.length)return;const path=editable[i];const result=await read(path);if(failed)return;
  bytes+=result.content===null?0:new TextEncoder().encode(result.content).byteLength;
  if(bytes>MAX_PROJECT_TEXT_BYTES)throw Error('Project text exceeds 64 MiB. The current project was kept.');
  results.set(path,result);if(++completed%32===0)await yieldControl();
 }}catch(e){failed=true;error=e;}};
 await Promise.all(Array.from({length:Math.min(8,editable.length)},worker));if(failed)throw error;
 return editable.map(path=>({path,...results.get(path)!}));
}
