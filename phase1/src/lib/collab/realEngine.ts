import {CollabDoc} from './collabDoc';
import {CollabClient,type CollabClientSnapshot} from './net/client';
import {secureRoomLinks,managedRoomId,roomExpiry,DEFAULT_SESSION_MINUTES} from './roomSecurity';
import {newLinkKey} from './net/crypto';
import type {TransportFactory} from './net/transport';
import {startBridge,type Bridge,type ProjectPort} from './projectBridge';
import {setSession,notifySession} from './session';
import {parseJoinLink,isInsecureRemote,modeOfLink,withMode,relayRoomUrl,cleanDisplayName} from './invite';
import {getLanHost,type LanHostPort} from './lanHostPort';
import {isCollabFile} from './paths';
import {makeUser,participantsOf} from './awarenessSafe';
import {removeAwarenessStates} from 'y-protocols/awareness';
import {idleSnapshot,type CollabEngine,type CollabSnapshot,type CollabError,type HostOptions} from './types';
export interface EngineDeps{
 project:ProjectPort;
 /** Whether a project is open and has files (host) */
 hasFiles():boolean;
 /** Can a guest join here without touching local work? */
 canJoin():{ok:true}|{ok:false;reason:'unsaved-project'};
 transport?:TransportFactory;
 lan?:()=>LanHostPort|null;
 hostName?:string;
 clientOptions?:{maxAttempts?:number;baseDelayMs?:number;maxDelayMs?:number;syncTimeoutMs?:number};
}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
/**
 * The real engine: one CollabClient per window, the same wire protocol in LAN-Direct and relay mode.
 * Host = a client of its own LAN host (desktop) or of a self-hosted relay room, seeded from the open project.
 * Guest = a client that adopts the shared project once a peer answers the sync handshake.
 * Nothing here pretends: states and labels come from the client's snapshot and the awareness list.
 */
export class RealEngine implements CollabEngine{
 private s:CollabSnapshot=idleSnapshot();
 private ls=new Set<()=>void>();
 private doc:CollabDoc|null=null;private client:CollabClient|null=null;private bridge:Bridge|null=null;
 private offClient:(()=>void)|null=null;private offAware:(()=>void)|null=null;private lan:LanHostPort|null=null;
 private busy=false;
 constructor(private d:EngineDeps){}
 subscribe(l:()=>void){this.ls.add(l);return()=>{this.ls.delete(l);};}
 snapshot(){return this.s;}
 private set(p:Partial<CollabSnapshot>){this.s={...this.s,...p};this.ls.forEach(l=>l());}
 private lanPort=()=>(this.d.lan?this.d.lan():getLanHost());

 private fromClient(c:CollabClientSnapshot):Partial<CollabSnapshot>{
  const state=c.state==='idle'?'off':c.state;
  return {state,synced:c.synced,attempt:c.attempt,queued:c.queued,
   security:{e2e:c.security.e2e,fingerprint:c.security.keyFingerprint,secureChannel:c.security.secureChannel,insecureRemote:c.security.insecureRemote},
   ...(c.error?{error:{kind:c.error.kind,message:c.error.message}}:{})};}

 /** Create doc + client, wire bridge/awareness/listeners. Resolves after the first connect (synced or sync timeout). */
 private async run(link:string,mode:'lan-direct'|'relay',role:'host'|'guest',name:string){
  const doc=this.doc=new CollabDoc();
  doc.awareness.setLocalStateField('user',makeUser(name,doc.doc.clientID));
  if(role==='host')for(const [path,text] of Object.entries(this.d.project.files()))if(isCollabFile(path))doc.text(path,text);
  setSession(doc);
  this.bridge=startBridge(doc,this.d.project,{role,onFiles:()=>notifySession()});
  const client=this.client=new CollabClient(link,{session:{doc:doc.doc,awareness:doc.awareness},mode,transport:this.d.transport,...this.d.clientOptions});
  const view=()=>{const c=client.snapshot(),ps=participantsOf(doc.awareness);return {...this.fromClient(c),participants:ps,synced:c.synced&&ps.length>1};};
  const refresh=()=>this.set(view());
  this.offClient=client.subscribe(refresh);
  const onAware=(ev?:{added:number[]},origin?:unknown)=>{
   this.set(view());
   // A blind relay does not tell existing peers about a newcomer, so nobody would send it our state until the next 15 s heartbeat. Answer a newcomer's announcement with ours.
   if(ev&&origin!=='local'&&ev.added.some(id=>id!==doc.doc.clientID)){const st=doc.awareness.getLocalState();if(st)doc.awareness.setLocalState({...st});}};
  doc.awareness.on('change',onAware);this.offAware=()=>doc.awareness.off('change',onAware);
  refresh();
  await client.connect();}

 private async teardown(){
  const doc=this.doc,client=this.client;
  if(doc&&client&&client.snapshot().state==='connected'){
   // tell the others we are gone right now instead of after the 30 s awareness timeout
   removeAwarenessStates(doc.awareness,[doc.doc.clientID],'leave');await sleep(80);}
  this.offClient?.();this.offAware?.();this.bridge?.stop();client?.leave();
  this.offClient=this.offAware=null;this.bridge=null;this.client=null;this.doc=null;
  setSession(null);doc?.destroy();}

 async startHosting(opts:HostOptions){
  if(this.busy||this.s.role!=='none')return;
  if(!this.d.hasFiles()){this.set({...idleSnapshot(),error:{kind:'no-project',message:'Open a project first. There is nothing to share yet.'}});return;}
  this.busy=true;
  const fail=async(e:CollabError)=>{await this.teardown();if(this.lan){await this.lan.stopLanHost().catch(()=>undefined);this.lan=null;}this.set({...idleSnapshot(),role:'none',state:'error',error:e});};
  try{
   const minutes=opts.sessionMinutes??DEFAULT_SESSION_MINUTES;
   if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw new Error('Session lifetime must be between 1 minute and 24 hours.');
   const expiresAt=Date.now()+minutes*60_000;
   const room=await managedRoomId(expiresAt);
   let hostLink:string,guestLinks:string[],localLink:string|null=null,noAddr=false;
   if(opts.mode==='relay'){
    const r=relayRoomUrl(opts.relayUrl,room.id);
    if(!r){this.busy=false;this.set({...idleSnapshot(),state:'error',error:{kind:'start-failed',message:'That is not a relay address. Use something like wss://relay.example.com'}});return;}
    const {param}=await newLinkKey();hostLink=withMode(`${r.url}#key=${param}`,'relay');guestLinks=[hostLink];
    this.set({...idleSnapshot(),role:'host',mode:'relay',state:'starting'});}
   else{
    const lan=this.lanPort();
    if(!lan){this.busy=false;this.set({...idleSnapshot(),state:'error',error:{kind:'start-failed',message:'LAN-Direct needs the Somnia desktop app. In the browser, use a relay.'}});return;}
    this.set({...idleSnapshot(),role:'host',mode:'lan-direct',state:'starting'});
    this.lan=lan;
    const info=await lan.startLanHost({lan:opts.lan,port:opts.port,roomId:room.id});
    const links=await lan.createLanSessionLinks(info);
    hostLink=withMode(links.localLink,'lan-direct');guestLinks=links.guestLinks.map(l=>withMode(l,'lan-direct'));localLink=hostLink;noAddr=opts.lan&&links.guestLinks.length===0;
    this.set({noNetworkAddress:noAddr});}
   const secure=await secureRoomLinks(hostLink,guestLinks,expiresAt,room);
   hostLink=secure.hostLink;guestLinks=secure.guestLinks;
   // Host capability is never exposed in a copyable local invite.
   if(localLink){const u=new URL(hostLink);u.search='';localLink=u.toString();}
   this.set({expiresAt:roomExpiry(hostLink)??expiresAt});
   const name=this.d.hostName??'Host';
   this.set({state:'connecting'});
   await this.run(hostLink,opts.mode,'host',name);
   this.set({guestLinks,localLink,noNetworkAddress:noAddr,role:'host'});
  }catch(e){
   const ce=this.s.error??{kind:'start-failed' as const,message:e instanceof Error?e.message:'Could not start sharing.'};
   await fail(ce.kind==='start-failed'||this.client===null?{kind:'start-failed',message:ce.message}:ce);
  }finally{this.busy=false;}}

 async stopHosting(){await this.leave();}

 async join(link:string,displayName:string){
  if(this.busy||this.s.role!=='none')return;
  const p=parseJoinLink(link);
  if(!p){this.set({...idleSnapshot(),state:'error',error:{kind:'bad-link',message:'That does not look like a Somnia invite link.'}});return;}
  const can=this.d.canJoin();
  if(!can.ok){this.set({...idleSnapshot(),state:'error',error:{kind:'unsaved-project',message:'Joining replaces the project in this window. Save it to a folder or close it first (Project > Close Project).'}});return;}
  this.busy=true;
  const mode=modeOfLink(link);
  this.set({...idleSnapshot(),role:'guest',mode,state:'connecting',expiresAt:roomExpiry(link)??undefined,security:{e2e:false,fingerprint:null,secureChannel:p.secure,insecureRemote:isInsecureRemote(p)}});
  try{await this.run(link.trim(),mode,'guest',cleanDisplayName(displayName));}
  catch(e){
   const err=this.s.error??{kind:'unreachable' as const,message:e instanceof Error?e.message:'Could not connect.'};
   await this.teardown();this.set({...idleSnapshot(),state:'error',error:err});}
  finally{this.busy=false;}}

 async leave(){
  const wasLan=this.lan;
  await this.teardown();
  if(wasLan){await wasLan.stopLanHost().catch(()=>undefined);this.lan=null;}
  this.set(idleSnapshot());}
}
