import {mcpDefinition,mcpToolName,registerMcpTools,type McpBridge,type McpCallApproval,type McpGrants,type McpToolInfo,type McpCallRecord} from './mcpTools';
import {toolSchemaHash,type AgentToolRegistry} from './toolRegistry';
/** Mirrors the Rust McpServerConfig. Saving a server is the user's approval to run exactly this command and argument list. */
export interface McpServerConfig {id:string;command:string;args:string[];env:Record<string,string>}
export interface McpServerView {config:McpServerConfig;running:boolean}
export type McpInvoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
export interface McpApprovalRequest {id:number;server:string;tool:string;args:Record<string,unknown>}
export interface McpSnapshot {servers:McpServerView[];tools:McpToolInfo[];grants:McpGrants;pending:McpApprovalRequest[];activity:McpCallRecord[];error:string;busy:boolean}
const GRANTS_KEY='somnia.mcp.grants.v1';
const readGrants=():McpGrants=>{try{const o=JSON.parse(globalThis.localStorage?.getItem(GRANTS_KEY)??'{}');return o&&typeof o==='object'&&!Array.isArray(o)?Object.fromEntries(Object.entries(o).filter(([,v])=>typeof v==='string')) as McpGrants:{};}catch{return {};}};
const writeGrants=(g:McpGrants)=>{try{globalThis.localStorage?.setItem(GRANTS_KEY,JSON.stringify(g));}catch{/* storage unavailable: grants last for this session */}};
const msg=(e:unknown)=>typeof e==='string'?e:e instanceof Error?e.message:'MCP request failed';
/** One runtime per window. State changes notify subscribers; the invoke function is injected so tests need no Tauri. */
export class McpRuntime {
  private snap:McpSnapshot={servers:[],tools:[],grants:readGrants(),pending:[],activity:[],error:'',busy:false};
  private ls=new Set<()=>void>();private resolvers=new Map<number,(ok:boolean)=>void>();private seq=0;
  constructor(private readonly invoke:McpInvoke){}
  subscribe=(f:()=>void)=>{this.ls.add(f);return()=>{this.ls.delete(f);};};
  getSnapshot=()=>this.snap;
  private set(p:Partial<McpSnapshot>){this.snap={...this.snap,...p};this.ls.forEach(f=>f());}
  private async guard<T>(f:()=>Promise<T>):Promise<T|undefined>{this.set({busy:true,error:''});try{return await f();}catch(e){this.set({error:msg(e)});return undefined;}finally{this.set({busy:false});}}
  async refresh(){await this.guard(async()=>{const servers=await this.invoke<McpServerView[]>('mcp_servers_list');const alive=new Set(servers.filter(s=>s.running).map(s=>s.config.id));this.set({servers,tools:this.snap.tools.filter(t=>alive.has(t.server))});});}
  async save(config:McpServerConfig){await this.guard(async()=>{await this.invoke('mcp_server_save',{config});});await this.refresh();}
  async remove(id:string){await this.guard(async()=>{await this.invoke('mcp_server_remove',{id});});this.set({tools:this.snap.tools.filter(t=>t.server!==id)});await this.refresh();}
  async start(id:string){await this.guard(async()=>{const list=await this.invoke<McpToolInfo[]>('mcp_server_start',{id});this.set({tools:[...this.snap.tools.filter(t=>t.server!==id),...list]});});await this.refresh();}
  async stop(id:string){await this.guard(async()=>{await this.invoke('mcp_server_stop',{id});});this.set({tools:this.snap.tools.filter(t=>t.server!==id)});await this.refresh();}
  /** A grant pins the tool's current schema hash. A changed description or schema silently drops the grant. */
  isGranted(t:McpToolInfo){const d=mcpDefinition(t);return this.snap.grants[d.name]===toolSchemaHash(d);}
  setGranted(t:McpToolInfo,on:boolean){const d=mcpDefinition(t);const g={...this.snap.grants};if(on)g[d.name]=toolSchemaHash(d);else delete g[d.name];writeGrants(g);this.set({grants:g});}
  readonly bridge:McpBridge={call:(server,tool,args)=>this.invoke<string>('mcp_tool_call',{server,tool,arguments:args})};
  /** Per-call human approval. Resolves false when aborted; never auto-approves. */
  readonly approve:McpCallApproval=(call,signal)=>new Promise<boolean>(resolve=>{
    if(signal.aborted){resolve(false);return;}
    const id=++this.seq;
    const done=(ok:boolean)=>{if(!this.resolvers.delete(id))return;this.set({pending:this.snap.pending.filter(p=>p.id!==id)});resolve(ok);};
    this.resolvers.set(id,done);signal.addEventListener('abort',()=>done(false),{once:true});
    this.set({pending:[...this.snap.pending,{id,server:call.server,tool:call.tool,args:call.args}]});});
  decide(id:number,ok:boolean){this.resolvers.get(id)?.(ok);}
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
