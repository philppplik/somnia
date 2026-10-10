/**
 * Host for Somnia's MCP tool server (docs/MCP-SERVER.md): owns the StudioMcpServer instance,
 * answers forwarded JSON-RPC messages from the Rust loopback gateway, and exposes the
 * start/stop/status surface for Settings > AI > Tools.
 *
 * The exposed tool set always matches the currently active studio document (same scope as the
 * agent panel's pinned document). Switching documents rebuilds the server; the gateway, port and
 * token stay untouched. Proposals staged by a client surface in the agent panel for review.
 */
import {StudioMcpServer} from './studioMcpServer';
import type {AgentToolContext,AgentToolRegistry} from './toolRegistry';
import {activeStudioDocument} from './studioTarget';
import {getMedia,subscribeMedia} from '../media';
import {getState,subscribe} from '../../store/appStore';

export interface StudioMcpInfo {running:boolean;port:number;token:string}
export interface StudioMcpCall {at:number;tool:string;studio:string;outcome:'ok'|'error'|'invalid'|'limited';ms:number}
export interface StudioMcpSnapshot {running:boolean;port:number;token:string;document:string;error:string;busy:boolean;activity:StudioMcpCall[]}
export type StudioMcpInvoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
export type StudioMcpListen=(event:string,cb:(payload:{id:number;message:string})=>void|Promise<void>)=>Promise<()=>void>;
export interface StudioMcpSource {studio:string;registry:AgentToolRegistry;context:AgentToolContext}
export type StudioMcpDeps={
 invoke:StudioMcpInvoke;
 listen:StudioMcpListen;
 /** Builds the source for a document path; production wiring is panelBridge.createStudioMcpSource. */
 source:(path:string)=>StudioMcpSource|null;
 /** Which document is exposed; production wiring follows the visible studio target. */
 target:()=>{path:string};
 version?:string;
};
const idle:StudioMcpSnapshot={running:false,port:0,token:'',document:'',error:'',busy:false,activity:[]};
export class StudioMcpHost {
 private snap:StudioMcpSnapshot=idle;
 private ls=new Set<()=>void>();
 private server:StudioMcpServer|null=null;
 private sourcePath='';
 private unlisten:(()=>void)|null=null;
 private detachStores:(()=>void)|null=null;
 constructor(private readonly d:StudioMcpDeps){}
 subscribe=(f:()=>void)=>{this.ls.add(f);return()=>{this.ls.delete(f);};};
 getSnapshot=()=>this.snap;
 private set(p:Partial<StudioMcpSnapshot>){this.snap={...this.snap,...p};this.ls.forEach(f=>f());}
 private readonly record=(r:{tool:string;studio:string;outcome:StudioMcpCall['outcome'];ms:number})=>{this.set({activity:[{at:Date.now(),...r},...this.snap.activity].slice(0,50)});};
 /** Rebuilds the protocol server when the exposed document changes. Never touches the gateway. */
 private rebuild(){
  const path=this.snap.running?this.d.target().path:'';
  if(path===this.sourcePath&&(path===''||this.server))return;
  this.sourcePath=path;
  if(!path){this.server=null;if(this.snap.document)this.set({document:''});return;}
  let source:StudioMcpSource|null=null;
  try{source=this.d.source(path);}catch{source=null;}
  // With no compatible document the server still answers initialize/tools/list (empty tool set),
  // so a client sees a healthy server instead of a confusing "turned off" error.
  this.server=new StudioMcpServer({sources:source?[source]:[],context:()=>source?source.context:{files:()=>({}),propose:async()=>{throw Error('No document is exposed.')}},enabled:()=>this.snap.running,onCall:this.record,version:this.d.version});
  if(this.snap.document!==(source?path:''))this.set({document:source?path:''});
 }
 /** Attach the gateway event channel and store watchers. Idempotent. */
 async attach(){
  if(this.unlisten)return;
  this.unlisten=await this.d.listen('somnia://studio-mcp',({id,message})=>this.forward(id,message));
  let timer:ReturnType<typeof setTimeout>|null=null;
  const poke=()=>{if(timer)return;timer=setTimeout(()=>{timer=null;this.rebuild();},150);};
  const a=subscribe(poke),b=subscribeMedia(poke);
  this.detachStores=()=>{a();b();};
  await this.refresh();
 }
 private async forward(id:number,message:string){
  let response:string|null=null;
  try{
   const parsed:unknown=JSON.parse(message);
   const out=this.server?await this.server.handle(parsed):{jsonrpc:'2.0' as const,id:null,error:{code:-32000,message:'Somnia tool server is turned off. Enable it in Settings > AI > Tools.'}};
   response=out?JSON.stringify(out):null;
  }catch{response=JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});}
  try{await this.d.invoke('studio_mcp_respond',{id,response});}catch{/* gateway already closed */}
 }
 private async guard(f:()=>Promise<void>){
  this.set({busy:true,error:''});
  try{await f();}catch(e){this.set({error:typeof e==='string'?e:e instanceof Error?e.message:'MCP server request failed'});}
  finally{this.set({busy:false});}
 }
 /** Reads the gateway state, e.g. after an app restart kept the server running. */
 async refresh(){await this.guard(async()=>{
  const info=await this.d.invoke<StudioMcpInfo>('studio_mcp_status');
  this.sourcePath='';this.server=null;
  this.set({running:info.running,port:info.port,token:info.token});
  this.rebuild();
 });}
 async start(){await this.guard(async()=>{
  const info=await this.d.invoke<StudioMcpInfo>('studio_mcp_start');
  this.set({running:info.running,port:info.port,token:info.token});
  this.rebuild();
 });}
 async stop(){await this.guard(async()=>{
  await this.d.invoke('studio_mcp_stop');
  this.server=null;this.sourcePath='';
  this.set({running:false,port:0,token:'',document:'',activity:[]});
 });}
 dispose(){this.unlisten?.();this.unlisten=null;this.detachStores?.();this.detachStores=null;this.server=null;}
}
let host:StudioMcpHost|null=null;
export const getStudioMcpHost=()=>host;
export function installStudioMcpHost(d:StudioMcpDeps){host?.dispose();host=new StudioMcpHost(d);return host;}
