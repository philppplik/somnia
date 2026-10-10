import {PermissionBroker,PermissionError,type PermissionSession} from './permissionBroker';

/** Capability resolver implemented by the desktop host using descriptor-relative I/O.
 * The renderer/guest must never be allowed to supply the canonical fields. A handle
 * pins the object checked by the broker so symlink replacement cannot change it.
 */
export interface ResolvedFile {
  canonicalPath:string; canonicalFolder:string; projectRoot:string|null;
  read():Promise<Uint8Array>;
  writeAtomic(bytes:Uint8Array,signal:AbortSignal):Promise<void>;
  close():void;
}
export interface FileResolver {resolve(path:string,operation:'read'|'write'):Promise<ResolvedFile>}
export interface ProxyResponse {status:number; headers:Readonly<Record<string,string>>; body:AsyncIterable<Uint8Array>}
export interface NetworkTransport {
  /** MUST disable automatic redirects, use HTTPS, and honor cancellation. */
  request(request:{url:string; method:'GET'|'POST'; headers:Record<string,string>; body?:Uint8Array; signal:AbortSignal; redirect:'manual'}):Promise<ProxyResponse>;
}
/** Trusted-only keychain interface. No read method is exposed over extension RPC. */
export interface SecretVault {read(extensionId:string,slot:string):Promise<string|null>}
export interface AgentProvider {
  /** Uses the user's existing agent configuration, billing and rate limits. */
  complete(request:{model:'host-default'; prompt:string; extensionId:string; signal:AbortSignal}):Promise<string>;
}
const requireAllowed=(decision:ReturnType<PermissionBroker['checkNetwork']>)=>{if(!decision.allowed)throw new PermissionError(decision.code);};
export const NETWORK_LIMITS=Object.freeze({responseBytes:10*1024*1024,timeoutMs:15000,requestsPerMinute:60,redirects:5});
export class ExtensionSecurityServices {
  private readonly rate=new Map<string,{start:number; count:number}>();
  constructor(private readonly broker:PermissionBroker,private readonly dependencies:{files:FileResolver; network:NetworkTransport; secrets:SecretVault; agent:AgentProvider},private readonly clock=()=>Date.now()) {}
  async readFile(session:PermissionSession,path:string):Promise<Uint8Array> {
    const file=await this.dependencies.files.resolve(path,'read');
    try {requireAllowed(this.broker.checkFilesystem(session,'read',file.canonicalPath,file.projectRoot,file.canonicalFolder));
      const bytes=await file.read();this.broker.assertCurrent(session);if(bytes.length>512*1024)throw new PermissionError('E_RESOURCE_LIMIT');return bytes;
    }finally{file.close();}
  }
  async writeFile(session:PermissionSession,path:string,bytes:Uint8Array,signal:AbortSignal):Promise<void> {
    if(bytes.length>1024*1024)throw new PermissionError('E_RESOURCE_LIMIT');
    const copy=bytes.slice(),file=await this.dependencies.files.resolve(path,'write');
    try {requireAllowed(this.broker.checkFilesystem(session,'write',file.canonicalPath,file.projectRoot,file.canonicalFolder));
      if(signal.aborted)throw new PermissionError('E_CANCELLED');
      // The resolver must check this signal immediately before rename/commit. The
      // supervisor's invalidation hook aborts all signals for this capability session.
      await file.writeAtomic(copy,AbortSignal.any([signal,this.broker.cancellationSignal(session)]));this.broker.assertCurrent(session);
    }finally{file.close();}
  }
  async request(session:PermissionSession,identity:{extensionId:string},input:{url:string; method?:'GET'|'POST'; headers?:Record<string,string>; body?:Uint8Array},cancel?:AbortSignal):Promise<{status:number;body:Uint8Array}> {
    this.broker.assertIdentity(session,identity.extensionId);
    requireAllowed(this.broker.checkNetwork(session,input.url));
    const now=this.clock();let rate=this.rate.get(identity.extensionId);if(!rate||now-rate.start>=60000){rate={start:now,count:0};this.rate.set(identity.extensionId,rate);}
    if(++rate.count>NETWORK_LIMITS.requestsPerMinute)throw new PermissionError('E_RESOURCE_LIMIT');
    const method=input.method??'GET';if(!['GET','POST'].includes(method))throw new PermissionError('E_INVALID_ARGUMENT');
    if(input.body&&input.body.length>1024*1024)throw new PermissionError('E_RESOURCE_LIMIT');
    const initialHeaders:Record<string,string>=Object.create(null);
    for(const [key,value] of Object.entries(input.headers??{})) {
      if(!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(key)||/[\u0000-\u001f\u007f]/.test(value)||value.length>8192||['host','connection','content-length','transfer-encoding','cookie','proxy-authorization','authorization'].includes(key.toLowerCase()))throw new PermissionError('E_INVALID_ARGUMENT');
      initialHeaders[key.toLowerCase()]=value;
    }
    const signal=AbortSignal.any([this.broker.cancellationSignal(session),AbortSignal.timeout(NETWORK_LIMITS.timeoutMs),...(cancel?[cancel]:[])]);
    let url=input.url;
    for(let redirect=0;redirect<=NETWORK_LIMITS.redirects;redirect++) {
      if(signal.aborted)throw new PermissionError('E_CANCELLED');
      requireAllowed(this.broker.checkNetwork(session,url));
      const headers:Record<string,string>={...initialHeaders};
      // Never forward injected credentials on redirects. Recompute against each
      // destination, with its own exact host scope and slot revocation.
      for(const injection of this.broker.secretInjections(session,url)) {
        const value=await this.dependencies.secrets.read(identity.extensionId,injection.secret);
        requireAllowed(this.broker.checkNetwork(session,url));
        this.broker.assertCurrent(session);
        if(value===null)throw new PermissionError('E_SECRET_REQUIRED');
        const header=(injection.prefix??'')+value;if(/[\u0000-\u001f\u007f]/.test(header)||header.length>8192)throw new PermissionError('E_INVALID_SECRET');
        headers[injection.header.toLowerCase()]=header;
      }
      this.broker.assertCurrent(session);
      const response=await this.dependencies.network.request({url,method,headers,body:input.body?.slice(),signal,redirect:'manual'});
      this.broker.assertCurrent(session);
      if([301,302,303,307,308].includes(response.status)) {
        // Reject POST redirects to avoid replaying sensitive request bodies to a new host.
        if(method!=='GET'||redirect===NETWORK_LIMITS.redirects)throw new PermissionError('E_REDIRECT_DENIED');
        const location=Object.entries(response.headers).find(([key])=>key.toLowerCase()==='location')?.[1];
        if(!location)throw new PermissionError('E_REDIRECT_DENIED');
        url=new URL(location,url).href;continue;
      }
      const chunks:Uint8Array[]=[];let size=0;
      for await(const chunk of response.body) {
        if(signal.aborted)throw new PermissionError('E_CANCELLED');this.broker.assertCurrent(session);
        size+=chunk.length;if(size>NETWORK_LIMITS.responseBytes)throw new PermissionError('E_RESOURCE_LIMIT');chunks.push(chunk.slice());
      }
      this.broker.assertCurrent(session);
      const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
      // Response headers (including any reflected credential) are not returned to the guest.
      return {status:response.status,body};
    }
    throw new PermissionError('E_REDIRECT_DENIED');
  }
  async complete(session:PermissionSession,extensionId:string,prompt:string,signal:AbortSignal):Promise<string> {
    this.broker.assertIdentity(session,extensionId);requireAllowed(this.broker.checkAgent(session,'host-default'));
    if(typeof prompt!=='string'||new TextEncoder().encode(prompt).length>64*1024)throw new PermissionError('E_RESOURCE_LIMIT');
    if(signal.aborted)throw new PermissionError('E_CANCELLED');
    const text=await this.dependencies.agent.complete({model:'host-default',prompt,extensionId,signal:AbortSignal.any([signal,this.broker.cancellationSignal(session)])});
    this.broker.assertCurrent(session);if(new TextEncoder().encode(text).length>1024*1024)throw new PermissionError('E_RESOURCE_LIMIT');return text;
  }
}
