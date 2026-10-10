import {ExtensionError,PROTOCOL_VERSION,type ErrorCode,type Json} from '../contracts/v2/api';
export const MAX_RPC_BYTES=1024*1024;
export interface RpcRequest {protocolVersion:1;generation:number;id:number;method:string;params:Json}
export interface RpcNotification {protocolVersion:1;generation:number;method:string;params:Json}
export interface RpcReply {protocolVersion:1;generation:number;id:number;result?:Json;error?:{code:ErrorCode;message:string;pointer?:string}}
export type RpcEnvelope=RpcRequest|RpcNotification|RpcReply;
const bad=()=>{throw new ExtensionError('E_INVALID_ARGUMENT','Invalid RPC frame.');};
const errorCodes=new Set(['E_PERMISSION_DENIED','E_WORKSPACE_UNTRUSTED','E_INVALID_ARGUMENT','E_INCOMPATIBLE_API','E_STALE_REVISION','E_CANCELLED','E_TIMEOUT','E_RESOURCE_LIMIT','E_HANDLER_MISSING','E_EXTENSION_FAULTED']);
const forbidden=new Set(['__proto__','constructor','prototype']);
/** A full JSON parser, rather than a reviver, so duplicate keys cannot disappear before validation. */
export function parseStrictJson(source:string):Json {
 let i=0; const ws=()=>{while(/[ \t\r\n]/.test(source[i]??'')&&i<source.length)i++;};
 const string=():string=>{const start=i++;while(i<source.length){if(source[i]==='"'){i++;try{return JSON.parse(source.slice(start,i));}catch{return bad();}}if(source[i]==='\\')i++;i++;}return bad();};
 const value=(depth:number):Json=>{
  if(depth>32)bad();ws();const c=source[i];
  if(c==='"')return string();
  if(c==='{'||c==='['){i++;ws();const array=c==='[';const end=array?']':'}';const result:any=array?[]:Object.create(null);const seen=new Set<string>();
   if(source[i]===end){i++;return result;}
   for(;;){ws();let key='';if(!array){if(source[i]!=='"')bad();key=string();if(seen.has(key)||forbidden.has(key))bad();seen.add(key);ws();if(source[i++]!==':')bad();}
    const child=value(depth+1);if(array)result.push(child);else result[key]=child;ws();if(source[i]===end){i++;return result;}if(source[i++]!==',')bad();}
  }
  const m=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(i));if(!m) return bad();i+=m[0].length;
  const result=JSON.parse(m[0]);if(typeof result==='number'&&(!Number.isFinite(result)||(Number.isInteger(result)&&!Number.isSafeInteger(result))))bad();return result;
 };const result=value(0);ws();if(i!==source.length)bad();return result;
}
export function checkJson(value:unknown,depth=0):asserts value is Json {
 if(depth>32)bad();if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){if(!Number.isFinite(value)||(Number.isInteger(value)&&!Number.isSafeInteger(value)))bad();return;}
 if(typeof value!=='object')bad();
 const proto=Object.getPrototypeOf(value);if(!Array.isArray(value)&&proto!==Object.prototype&&proto!==null)bad();
 for(const [k,v] of Object.entries(value as object)){if(forbidden.has(k))bad();checkJson(v,depth+1);}
}
export function validateEnvelope(input:unknown,generation:number):RpcEnvelope {
 checkJson(input);const bytes=new TextEncoder().encode(JSON.stringify(input)).length;if(bytes>MAX_RPC_BYTES)throw new ExtensionError('E_RESOURCE_LIMIT','RPC frame exceeds 1 MiB.');
 if(!input||typeof input!=='object'||Array.isArray(input))return bad();const m=input as Record<string,Json>;
 if(m.protocolVersion!==PROTOCOL_VERSION||m.generation!==generation)bad();
 if('method' in m){if(Object.keys(m).some(k=>!['protocolVersion','generation','id','method','params'].includes(k))||typeof m.method!=='string'||!('params'in m))bad();}
 else {if(Object.keys(m).some(k=>!['protocolVersion','generation','id','result','error'].includes(k))||(('result'in m)===('error'in m))||!('id'in m))bad();
  if('error'in m){const e=m.error;if(!e||typeof e!=='object'||Array.isArray(e)||typeof e.code!=='string'||!errorCodes.has(e.code)||('pointer'in e&&typeof e.pointer!=='string')||typeof e.message!=='string'||e.message.length>200||Object.keys(e).some(k=>!['code','message','pointer'].includes(k)))bad();}
 }
 if('id'in m&&(!Number.isSafeInteger(m.id)||(m.id as number)<1))bad();
 return input as unknown as RpcEnvelope;
}
export function encodePipeFrame(envelope:RpcEnvelope):Uint8Array {
 validateEnvelope(envelope,envelope.generation);const bytes=new TextEncoder().encode(JSON.stringify(envelope));const out=new Uint8Array(bytes.length+4);new DataView(out.buffer).setUint32(0,bytes.length,true);out.set(bytes,4);return out;
}
/** Incremental desktop decoder. Bounded prefix allocation; UTF-8 and duplicate keys fail closed. */
export class PipeDecoder {
 private buffer=new Uint8Array(0);
 push(chunk:Uint8Array,generation:number):RpcEnvelope[]{
  if(chunk.length+this.buffer.length>2*MAX_RPC_BYTES+8)throw new ExtensionError('E_RESOURCE_LIMIT','Pipe batch exceeds budget.');
  const merged=new Uint8Array(this.buffer.length+chunk.length);merged.set(this.buffer);merged.set(chunk,this.buffer.length);this.buffer=merged;const result:RpcEnvelope[]=[];let offset=0;
  while(this.buffer.length-offset>=4){const len=new DataView(this.buffer.buffer,this.buffer.byteOffset+offset,4).getUint32(0,true);if(!len||len>MAX_RPC_BYTES)bad();if(this.buffer.length-offset-4<len)break;
   const text=new TextDecoder('utf-8',{fatal:true}).decode(this.buffer.subarray(offset+4,offset+4+len));result.push(validateEnvelope(parseStrictJson(text),generation));offset+=4+len;}
  this.buffer=this.buffer.slice(offset);return result;
 }
}
