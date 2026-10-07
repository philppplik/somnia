import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {createPublicKey,createVerify,randomBytes,randomUUID} from 'node:crypto';
import {b64url,s256,newVerifier} from './pkce';
import type {OAuthSubject,SubjectDeps,ConnectionSummary} from '../subject';
/**
 * Test-side reference client. It exists to prove the conformance suite is satisfiable and correct
 * (a suite that no implementation can pass, or that any implementation passes, is worthless).
 * It is NOT the production client and must not be imported from app code.
 */
export const SERVICE='de.philipp-paulik.somnia.agent';
export const ENTRY='connection/openai-chatgpt';
export const SCOPES='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const RESOURCE='https://api.openai.com/v1';
type Rec={v:2;clientId:string;hostId:string;sub:string;email:string;access:string;refresh:string;exp:number;earliest:number;scopes:string[];state:'connected'|'reauthorization-required'};
export function referenceSubject(d:SubjectDeps):OAuthSubject{
 // Stable per-installation host id, persisted BEFORE the first login.
 const hostId=(()=>{let h=d.store.get(SERVICE,'host/id');if(!h){h='urn:uuid:'+randomUUID();d.store.set(SERVICE,'host/id',h);}return h;})();
 let inflight:Promise<Rec>|null=null;
 const load=():Rec|null=>{const s=d.store.get(SERVICE,ENTRY);return s?JSON.parse(s) as Rec:null;};
 const save=(r:Rec)=>d.store.set(SERVICE,ENTRY,JSON.stringify(r));
 const form=(o:Record<string,string>)=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:new URLSearchParams(o).toString(),redirect:'error' as const,credentials:'omit' as const});
 async function verifyId(idToken:string,o:{aud:string;nonce:string}){
  const [h,p,sg]=idToken.split('.');if(!h||!p||!sg)throw new Error('bad id_token');
  const hdr=JSON.parse(Buffer.from(h,'base64url').toString());const pl=JSON.parse(Buffer.from(p,'base64url').toString());
  const jwks=await (await d.fetch(d.endpoints.jwks)).json() as {keys:any[]};
  const jwk=jwks.keys.find(k=>k.kid===hdr.kid);if(!jwk||hdr.alg!=='RS256')throw new Error('bad id_token key');
  if(!createVerify('RSA-SHA256').update(h+'.'+p).verify(createPublicKey({key:jwk,format:'jwk'}),Buffer.from(sg,'base64url')))throw new Error('bad id_token signature');
  if(pl.iss!==d.endpoints.issuer||pl.aud!==o.aud||pl.nonce!==o.nonce||pl.exp<=d.clock.seconds())throw new Error('bad id_token claims');
  return pl as {sub:string;email:string};
 }
 const summary=(r:Rec):ConnectionSummary=>({state:r.state,scopes:r.scopes,accountLabel:r.email.replace(/^(.).*(@.*)$/,'$1***$2'),clientId:r.clientId});
 // Cross-instance lock keyed by store (stands in for the production per-connection cross-process lock).
 const locks=(globalThis as {__oauthLocks?:WeakMap<object,Promise<unknown>>});locks.__oauthLocks??=new WeakMap();
 const withLock=<T,>(fn:()=>Promise<T>):Promise<T>=>{const prev=(locks.__oauthLocks!.get(d.store)??Promise.resolve()) as Promise<unknown>;const next=prev.catch(()=>{}).then(fn);locks.__oauthLocks!.set(d.store,next.catch(()=>{}));return next;};
 const fresh=(r:Rec)=>d.clock.seconds()<Math.min(r.exp-30,r.earliest);
 async function doRefresh(stale:string):Promise<Rec>{
  return withLock(async()=>{
   const r=load();if(!r||r.state!=='connected')throw new Error('not connected');
   if(r.refresh!==stale&&fresh(r))return r; // another instance already rotated: use its result, never burn the token twice
   const res=await d.fetch(d.endpoints.token,form({grant_type:'refresh_token',refresh_token:r.refresh,client_id:r.clientId,resource:RESOURCE}));
   if(!res.ok){
    const code=(await res.json().catch(()=>({}))as {error?:string}).error;
    if(code==='invalid_grant'||code==='invalid_client'){save({...r,access:'',refresh:'',state:'reauthorization-required'});throw new Error('reauthorization-required');}
    throw new Error('refresh-unavailable'); // transient: keep the token set untouched
   }
   const t=await res.json() as {access_token:string;refresh_token:string;expires_in:number;earliest_refresh_at?:number;scope:string};
   const n:Rec={...r,access:t.access_token,refresh:t.refresh_token,exp:d.clock.seconds()+t.expires_in,earliest:t.earliest_refresh_at??d.clock.seconds()+Math.floor(t.expires_in*0.8),scopes:t.scope.split(' ')};
   // Rotation: the old refresh token is already invalid remotely. Persist the replacement (one retry); otherwise flag reauthorization.
   try{save(n);}catch{try{save(n);}catch{try{save({...r,access:'',refresh:'',state:'reauthorization-required'});}catch{/* store unusable: next load reports locked */}throw new Error('persistence-failed');}}
   return n;
  });
 }
 const refresh=(stale:string)=>inflight??(inflight=doRefresh(stale).finally(()=>{inflight=null;}));
 async function accessToken(force=false){
  const r=load();if(!r)throw new Error('signed out');if(r.state!=='connected')throw new Error('reauthorization-required');
  if(!force&&d.clock.seconds()<Math.min(r.exp-30,r.earliest))return r.access;
  return (await refresh(r.refresh)).access;
 }
 return {
  async signIn(opts={}){
   const disc={authorization_endpoint:d.endpoints.authorize,token_endpoint:d.endpoints.token};
   const existing=load();
   const state=b64url(randomBytes(16)),nonce=b64url(randomBytes(16)),verifier=newVerifier();
   let resolveCb!:(u:URL)=>void;const cb=new Promise<URL>(r=>{resolveCb=r;});
   const srv=http.createServer((q,s)=>{const u=new URL(q.url??'/','http://127.0.0.1');if(u.pathname!=='/auth/callback'){s.writeHead(404).end();return;}s.writeHead(200).end('ok');resolveCb(u);});
   await new Promise<void>(r=>srv.listen(0,'127.0.0.1',r));
   const redirect=`http://127.0.0.1:${(srv.address() as AddressInfo).port}/auth/callback`;
   try{
    const bootstrap=!existing?.clientId;
    let clientId=existing?.clientId??'dynamic_agent_client';
    const u=new URL(disc.authorization_endpoint!);
    for(const [k,v] of Object.entries({response_type:'code',client_id:clientId,agent_name_hint:'Somnia',ext_agent_host_id:hostId,redirect_uri:redirect,scope:SCOPES,resource:RESOURCE,state,nonce,code_challenge:s256(verifier),code_challenge_method:'S256'}))u.searchParams.set(k,v);
    await d.openBrowser(u.toString());
    const timer=opts.timeoutMs?new Promise<never>((_,rej)=>d.clock.setTimeout(()=>rej(new Error('timeout')),opts.timeoutMs)):null;
    const abort=opts.signal?new Promise<never>((_,rej)=>opts.signal!.addEventListener('abort',()=>rej(new Error('cancelled')),{once:true})):null;
    const got=await Promise.race([cb,...(timer?[timer]:[]),...(abort?[abort]:[])]);
    if(got.searchParams.get('state')!==state)throw new Error('state mismatch');
    if(got.searchParams.get('error'))throw new Error('denied');
    if(bootstrap){const issued=got.searchParams.get('client_id');if(!issued||!/^oaiapp_/.test(issued))throw new Error('no issued client id');clientId=issued;}
    else if(got.searchParams.get('client_id')&&got.searchParams.get('client_id')!==clientId)throw new Error('client id mismatch');
    const code=got.searchParams.get('code');if(!code)throw new Error('no code');
    const res=await d.fetch(disc.token_endpoint!,form({grant_type:'authorization_code',code,redirect_uri:redirect,client_id:clientId,code_verifier:verifier,resource:RESOURCE}));
    if(!res.ok)throw new Error('exchange failed');
    const t=await res.json() as {access_token:string;refresh_token:string;expires_in:number;earliest_refresh_at?:number;scope:string;id_token?:string};
    if(!t.id_token)throw new Error('missing id_token');
    const id=await verifyId(t.id_token,{aud:clientId,nonce});
    if(existing&&existing.sub!==id.sub)throw new Error('identity mismatch');
    const scopes=t.scope.split(' ');
    if(!scopes.includes('resource.invoke')||!scopes.includes('chatgpt.tokens.use.direct'))throw new Error('plan permission not granted');
    const rec:Rec={v:2,clientId,hostId,sub:id.sub,email:id.email,access:t.access_token,refresh:t.refresh_token,exp:d.clock.seconds()+t.expires_in,earliest:t.earliest_refresh_at??d.clock.seconds()+Math.floor(t.expires_in*0.8),scopes,state:'connected'};
    save(rec);return summary(rec);
   }finally{await new Promise<void>(r=>{srv.closeAllConnections();srv.close(()=>r());});}
  },
  accessToken:()=>accessToken(),
  async request(url,init={}){
   const go=async(tok:string)=>d.fetch(url,{...init,headers:{...(init.headers as Record<string,string>|undefined),authorization:'Bearer '+tok},redirect:'error',credentials:'omit'});
   let res=await go(await accessToken());
   if(res.status===401){void res.body?.cancel();res=await go(await accessToken(true));} // exactly one retry
   return res;
  },
  async signOut(){
   const r=load();let remote=false;
   if(r&&r.refresh){try{const x=await d.fetch(d.endpoints.revoke,form({token:r.refresh,token_type_hint:'refresh_token',client_id:r.clientId}));remote=x.ok;}catch{remote=false;}}
   if(r)save({...r,access:'',refresh:'',state:'reauthorization-required'}); // keeps client/host mapping for later sign-in
   return {remoteRevoked:remote};
  },
  async status(){const r=load();return r?summary(r):null;},
 };
}
