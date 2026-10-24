import {MCP_CONSENT_REQUIRED,mcpDefinition,mcpToolName,registerMcpTools,type McpDecision,type McpBridge,type McpCallApproval,type McpGrants,type McpToolInfo,type McpCallRecord} from './mcpTools';
import {toolSchemaHash,type AgentToolRegistry} from './toolRegistry';
/** Mirrors the Rust McpServerConfig. Saving a server is the user's approval to run exactly this command and argument list. */
export interface McpServerConfig {id:string;command:string;args:string[];env:Record<string,string>}
export interface McpServerView {config:McpServerConfig;running:boolean}
export type McpInvoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
export interface McpApprovalRequest {id:number;server:string;tool:string;args:Record<string,unknown>;/** 'call' = one tool call; 'start' = start a server process (tool is empty, args hold the program and arguments). */kind:'call'|'start'}
/** Grants of the MCP broker scope. Separate stores: program (shell), domain (network), digest-bound tool (mcp). */
export interface McpBrokerGrant {grantId:string;kind?:string;target?:string}
export interface McpToolGrant {grantId:string;server:string;tool:string;schemaDigest:string}
export interface McpBrokerGrants {shell:McpBrokerGrant[];network:McpBrokerGrant[];mcp:McpToolGrant[]}
export const NO_BROKER_GRANTS:McpBrokerGrants={shell:[],network:[],mcp:[]};
type Answer=Exclude<McpDecision,'granted'>;
export interface McpSnapshot {servers:McpServerView[];tools:McpToolInfo[];grants:McpGrants;brokerGrants:McpBrokerGrants;pending:McpApprovalRequest[];activity:McpCallRecord[];error:string;busy:boolean}
const GRANTS_KEY='somnia.mcp.grants.v1';
const readGrants=():McpGrants=>{try{const o=JSON.parse(globalThis.localStorage?.getItem(GRANTS_KEY)??'{}');return o&&typeof o==='object'&&!Array.isArray(o)?Object.fromEntries(Object.entries(o).filter(([,v])=>typeof v==='string')) as McpGrants:{};}catch{return {};}};
const writeGrants=(g:McpGrants)=>{try{globalThis.localStorage?.setItem(GRANTS_KEY,JSON.stringify(g));}catch{/* storage unavailable: grants last for this session */}};
const msg=(e:unknown)=>typeof e==='string'?e:e instanceof Error?e.message:'MCP request failed';
/** One runtime per window. State changes notify subscribers; the invoke function is injected so tests need no Tauri. */
export class McpRuntime {
  private snap:McpSnapshot={servers:[],tools:[],grants:readGrants(),brokerGrants:NO_BROKER_GRANTS,pending:[],activity:[],error:'',busy:false};
  private ls=new Set<()=>void>();private resolvers=new Map<number,(a:Answer)=>void>();private seq=0;
  constructor(private readonly invoke:McpInvoke){}
  subscribe=(f:()=>void)=>{this.ls.add(f);return()=>{this.ls.delete(f);};};
  getSnapshot=()=>this.snap;
  private set(p:Partial<McpSnapshot>){this.snap={...this.snap,...p};this.ls.forEach(f=>f());}
  private async guard<T>(f:()=>Promise<T>):Promise<T|undefined>{this.set({busy:true,error:''});try{return await f();}catch(e){this.set({error:msg(e)});return undefined;}finally{this.set({busy:false});}}
  async refresh(){await this.guard(async()=>{const servers=await this.invoke<McpServerView[]>('mcp_servers_list');const alive=new Set(servers.filter(s=>s.running).map(s=>s.config.id));this.set({servers,tools:this.snap.tools.filter(t=>alive.has(t.server))});});}
  async save(config:McpServerConfig){await this.guard(async()=>{await this.invoke('mcp_server_save',{config});});await this.refresh();}
  async remove(id:string){await this.guard(async()=>{await this.invoke('mcp_server_remove',{id});});this.set({tools:this.snap.tools.filter(t=>t.server!==id)});await this.refresh();}
  /** Starting a server is a broker decision (process spawn). A covering program grant needs no question; otherwise the broker answers mcp_consent_required and the user decides once per start or for the session. */
  async start(id:string){await this.guard(async()=>{
   const run=(choice?:Answer)=>this.invoke<McpToolInfo[]>('mcp_server_start',choice?{id,choice}:{id});
   let list:McpToolInfo[];
   try{list=await run();}catch(e){
    if(!msg(e).includes(MCP_CONSENT_REQUIRED))throw e;
    const cfg=this.snap.servers.find(s=>s.config.id===id)?.config;
    const a=await this.ask({server:id,tool:'',args:{command:cfg?.command??'',arguments:cfg?.args??[]},kind:'start'});
    if(a==='deny')throw Error('mcp_denied');
    list=await run(a);}
   this.set({tools:[...this.snap.tools.filter(t=>t.server!==id),...list]});await this.refreshGrants();});const err=this.snap.error;await this.refresh();if(err)this.set({error:err});}
  /** Grants of the broker scope (empty outside the desktop app or before the first use). */
  async refreshGrants(){try{const g=await this.invoke<McpBrokerGrants|null>('mcp_grants_list');this.set({brokerGrants:g&&Array.isArray(g.shell)&&Array.isArray(g.network)&&Array.isArray(g.mcp)?g:NO_BROKER_GRANTS});}catch{this.set({brokerGrants:NO_BROKER_GRANTS});}}
  /** Revoke one grant; the next use asks again. */
  async revokeGrant(kind:'shell'|'network'|'mcp',grantId:string){await this.guard(async()=>{await this.invoke('mcp_grant_revoke',{kind,grantId});});await this.refreshGrants();}
  private covered(c:{server:string;tool:string;schemaDigest?:string}){return !!c.schemaDigest&&this.snap.brokerGrants.mcp.some(g=>g.server===c.server&&g.tool===c.tool&&g.schemaDigest===c.schemaDigest);}
  async stop(id:string){await this.guard(async()=>{await this.invoke('mcp_server_stop',{id});});this.set({tools:this.snap.tools.filter(t=>t.server!==id)});await this.refresh();}
  /** A grant pins the tool's current schema hash. A changed description or schema silently drops the grant. */
  isGranted(t:McpToolInfo){const d=mcpDefinition(t);return this.snap.grants[d.name]===toolSchemaHash(d);}
  setGranted(t:McpToolInfo,on:boolean){const d=mcpDefinition(t);const g={...this.snap.grants};if(on)g[d.name]=toolSchemaHash(d);else delete g[d.name];writeGrants(g);this.set({grants:g});}
  readonly bridge:McpBridge={call:async(server,tool,args,choice)=>{const out=await this.invoke<string>('mcp_tool_call',choice?{server,tool,arguments:args,choice}:{server,tool,arguments:args});if(choice==='allow_for_run')void this.refreshGrants();return out;}};
  /** One question to the user (call or start). Resolves 'deny' when aborted; never auto-approves. */
  private ask(req:Omit<McpApprovalRequest,'id'>,signal?:AbortSignal){return new Promise<Answer>(resolve=>{
    if(signal?.aborted){resolve('deny');return;}
    const id=++this.seq;
    const done=(a:Answer)=>{if(!this.resolvers.delete(id))return;this.set({pending:this.snap.pending.filter(p=>p.id!==id)});resolve(a);};
    this.resolvers.set(id,done);signal?.addEventListener('abort',()=>done('deny'),{once:true});
    this.set({pending:[...this.snap.pending,{id,...req}]});});}
  /** Per-call approval. An exact digest-bound broker grant answers 'granted' without a dialog; otherwise a human decides. */
  readonly approve:McpCallApproval=async(call,signal,opts)=>{
    if(!opts?.forcePrompt&&this.covered(call))return 'granted';
    return this.ask({server:call.server,tool:call.tool,args:call.args,kind:'call'},signal);};
  decide(id:number,answer:boolean|Answer){this.resolvers.get(id)?.(answer===true?'allow_once':answer===false?'deny':answer);}
  /** Adds the granted tools of running servers to a registry. Returns their model-facing names. */
  register(registry:AgentToolRegistry):string[]{return registerMcpTools(registry,this.snap.tools,this.snap.grants,this.bridge,this.approve,this.record);}
  /** Newest first, last 50 calls, in memory only. No arguments or results are kept. */
  private readonly record=(r:McpCallRecord)=>{this.set({activity:[r,...this.snap.activity].slice(0,50)});};
  clearActivity(){this.set({activity:[]});}
}
let runtime:McpRuntime|null=null;
export const getMcpRuntime=()=>runtime;
export function installMcpRuntime(invoke:McpInvoke){runtime=new McpRuntime(invoke);return runtime;}
export {mcpToolName};
