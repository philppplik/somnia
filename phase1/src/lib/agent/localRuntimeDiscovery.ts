/** Discovery is metadata, never evidence of local processing or inference compatibility. */
export type DiscoveryRuntime='ollama'|'llama.cpp'|'lmstudio';
export interface DiscoveredModel {id:string;sizeBytes?:number;capabilities:string[]|null;locality:'unverified'}
export function discoveryOrigin(raw:string):string {
 const url=new URL(raw);const h=url.hostname;
 if(url.protocol!=='http:'||!(h==='localhost'||h==='[::1]'||/^127(\.\d{1,3}){3}$/.test(h))||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Discovery requires an HTTP loopback origin');
 return url.origin;
}
export function discoveryPath(runtime:DiscoveryRuntime):string {
 switch(runtime){case 'ollama':return '/api/tags';case 'llama.cpp':return '/v1/models';case 'lmstudio':return '/api/v1/models';default:throw Error('Unsupported local runtime');}
}
export function parseDiscoveredModels(runtime:DiscoveryRuntime,value:unknown):DiscoveredModel[]{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid runtime model inventory');
 const data=value as Record<string,unknown>;const rows=runtime==='llama.cpp'?data.data:data.models;
 if(!Array.isArray(rows)||rows.length>10000)throw Error('Invalid runtime model inventory');
 return rows.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid runtime model row');
  const m=row as Record<string,unknown>;const id=runtime==='lmstudio'?m.key:runtime==='ollama'?m.model??m.name:m.id;
  if(typeof id!=='string'||!id.trim()||id.length>512||/[\x00-\x1f\x7f]/.test(id))throw Error('Invalid model identifier');
  const bytes=runtime==='lmstudio'?m.size_bytes:m.size;
  const capabilities=Array.isArray(m.capabilities)&&m.capabilities.every(c=>typeof c==='string')?m.capabilities as string[]:null;
  return {id,sizeBytes:typeof bytes==='number'&&Number.isFinite(bytes)&&bytes>=0?bytes:undefined,capabilities,locality:'unverified' as const};
 });
}
