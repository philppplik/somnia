/**
 * Collab protocol client (v11/collab-protocol): connects one shared project (Y.Doc + Awareness) to a peer
 * over the wire format in protocol.ts. Works against the host's app in LAN-Direct mode and against a
 * self-hosted relay in relay mode - the frames are identical, the mode label exists so the UI can be honest
 * about where the bytes go.
 *
 * Real behaviour, no stand-ins:
 * - handshake: sync step1 on open; the relay (or any peer, through a blind relay) answers step2.
 * - auth: the invite code travels in the WebSocket URL query, as the spike relay and ADR-005 require.
 * - E2E: with a #key= fragment every sync/awareness frame is AES-GCM encrypted (crypto.ts).
 * - offline queue: edits made while disconnected are buffered (outbox) and flushed on the next open;
 *   the Y.Doc itself stays the source of truth, so an outbox overflow is covered by the sync handshake.
 * - reconnect: dropped connections retry with exponential backoff + jitter; revoked/blocked closes are final.
 */
import * as Y from 'yjs';
import {MSG_CHAT_SYNC,chatStep1,chatUpdate,handleChatFrame,peekChatSyncType} from '../chatProtocol';
import type {Awareness} from 'y-protocols/awareness';
import {MAX_RELAY_FRAME_BYTES,SYNC_CHUNK_BYTES,MSG_SYNC,MSG_AWARENESS,MSG_IDENTITY,MSG_PING,MSG_PONG,MSG_SYNC_CHUNK,encodeSyncStep1,encodeUpdate,encodeAwareness,encodeIdentity,encodePing,encodePong,encodeSyncChunk,decodeSyncChunk,peekSyncType,readIdentity,handleMessage,MSG_BLOB} from './protocol';
import type {PublicIdentity,PresencePerson,IdentityMessage} from './protocol';
import {encryptFrame,decryptFrame,isEncryptedFrame,importLinkKey,linkKeyParam} from './crypto';
import type {LinkKey} from './crypto';
import type {Transport,TransportFactory} from './transport';
import {webSocketTransport} from './transport';
import {parseInviteLink,isInsecureRemote} from '../inviteCore';
import type {ParsedInvite} from '../inviteCore';
import type {CollabError} from '../types';
import {roomExpiry} from '../roomSecurity';
const MANAGED_ACK=new TextEncoder().encode('\x04managed-room-v1');

/** Room-URL of the Relay-Wire-Contract v0: /room/<room-id>, 8-128 chars, the id itself is the credential. */
const ROOM_PATH=/^\/room\/[A-Za-z0-9_-]{8,128}$/;
/**
 * Accepts both invite shapes: the host app's `?code=` link (spike relay, LAN-Direct) and the self-hosted
 * relay's room link where the room id carries the access entropy and no code parameter exists.
 */
export function parseWireInvite(input:string):ParsedInvite|null{
 const classic=parseInviteLink(input);if(classic)return classic;
 const text=input.trim();if(!text||text.length>600||/\s/.test(text))return null;
 let u:URL;try{u=new URL(text);}catch{return null;}
 if(u.protocol!=='ws:'&&u.protocol!=='wss:')return null;
 if(u.username||u.password||!u.hostname)return null;
 if(!ROOM_PATH.test(u.pathname))return null;
 return {url:u.toString(),host:u.host,secure:u.protocol==='wss:',
  local:/^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i.test(u.hostname),code:''};
}

export type ClientState='idle'|'connecting'|'connected'|'reconnecting'|'error';
export type CollabMode='lan-direct'|'relay';

export interface CollabSession{doc:Y.Doc;awareness:Awareness}
export interface CollabClientOptions{
 session:CollabSession;
 /** Separate volatile chat doc. Chat requires an encrypted link. */
 chatDoc?:Y.Doc;
 /** Where this link points, for honest UI labels. The wire behaviour is identical. */
 mode?:CollabMode;
 transport?:TransportFactory;
 /** Reconnect attempts before giving up (initial connect and mid-session drops alike). Default 6. */
 maxAttempts?:number;
 baseDelayMs?:number;   // default 500
 maxDelayMs?:number;    // default 15000
 /** Resolve connect() this long after open even without a peer's step2 (empty blind-relay session). Default 2000. */
 syncTimeoutMs?:number;
 /** Outbound updates buffered while disconnected. Overflow is safe: sync on reconnect covers it. Default 1000. */
 outboxLimit?:number;
 /** Liveness probe interval while connected. Default 15000; 0 disables (tests). */
 heartbeatMs?:number;
 /** No inbound frame for this long = the connection is silently dead: close and let the reconnect logic run. Default 45000. */
 heartbeatDeadMs?:number;
 random?:()=>number;    // jitter source, tests
}
export interface CollabClientSnapshot{
 state:ClientState;mode:CollabMode;synced:boolean;
 /** True once the existing chat history has arrived (a peer's step2), or none came within syncTimeoutMs of the project sync (nobody to ask). Chat unread badges wait for this. */
 chatSynced:boolean;attempt:number;
 identity:PublicIdentity|null;people:PresencePerson[];error:CollabError|null;
 queued:number;droppedFromQueue:number;
 security:{e2e:boolean;keyFingerprint:string|null;secureChannel:boolean;insecureRemote:boolean};
}

/** Close codes the spike relay uses; a web client never sees the HTTP status of a refused upgrade. */
const CLOSE_REFUSED=[4001,4003]; // invite revoked (secure relay 4001, spike relay 4003)
const CLOSE_BLOCKED=1008;        // rate limit / send budget (relay contract: Sendebudget)
const CLOSE_PROTOCOL=1003;       // malformed frame (relay contract: text frame received)
const CLOSE_TOO_BIG=1009;        // relay contract: frame over 2 MiB - resyncing would resend it, so this is final

export class CollabClient{
 private s:CollabClientSnapshot;
 private ls=new Set<()=>void>();
 private transport:Transport|null=null;
 private ready=false;
 private linkKey:LinkKey|null=null;
 private outbox:Uint8Array[]=[];
 private sendChain:Promise<void>=Promise.resolve();
 private timer:ReturnType<typeof setTimeout>|null=null;
 private intentional=false;
 private managed=false;private acknowledged=false;
 private expiryTimer:ReturnType<typeof setTimeout>|null=null;
 private connectDone:(()=>void)|null=null;
 private connectFail:((e:Error)=>void)|null=null;
 private offDoc:()=>void;
 private chatTimer:ReturnType<typeof setTimeout>|null=null;
 private offChat:()=>void=()=>{};private chatDoc:Y.Doc|undefined;
 private offAware:()=>void;
 private tf:TransportFactory;
 private sess:CollabSession;
 private heartbeatTimer:ReturnType<typeof setInterval>|null=null;
 private lastActivity=0;
 private syncChunks=new Map<string,{count:number;parts:Map<number,Uint8Array>;at:number}>();
 private chunkSeq=0;
 private o:{maxAttempts:number;baseDelayMs:number;maxDelayMs:number;syncTimeoutMs:number;outboxLimit:number;heartbeatMs:number;heartbeatDeadMs:number;random?:()=>number};

 constructor(private invite:string,opts:CollabClientOptions){
  this.sess=opts.session;this.chatDoc=opts.chatDoc;
  if(this.chatDoc){const onChat=(u:Uint8Array,origin:unknown)=>{if(origin!==this&&this.linkKey&&this.open())this.sendFrame(chatUpdate(u));};this.chatDoc.on('update',onChat);this.offChat=()=>this.chatDoc?.off('update',onChat);}
  this.o={maxAttempts:opts.maxAttempts??6,baseDelayMs:opts.baseDelayMs??500,maxDelayMs:opts.maxDelayMs??15_000,
   syncTimeoutMs:opts.syncTimeoutMs??2_000,outboxLimit:opts.outboxLimit??1_000,
   heartbeatMs:opts.heartbeatMs??15_000,heartbeatDeadMs:opts.heartbeatDeadMs??45_000,random:opts.random};
  this.tf=opts.transport??webSocketTransport;
  this.s={state:'idle',mode:opts.mode??'lan-direct',synced:false,chatSynced:false,attempt:0,identity:null,people:[],error:null,
   queued:0,droppedFromQueue:0,security:{e2e:false,keyFingerprint:null,secureChannel:false,insecureRemote:false}};
  const onUpdate=(u:Uint8Array,origin:unknown)=>{if(origin===this)return;
   if(this.open())this.sendFrame(encodeUpdate(u));
   else if(this.outbox.length<this.o.outboxLimit){this.outbox.push(u);this.patch({queued:this.outbox.length});}
   else this.patch({droppedFromQueue:this.s.droppedFromQueue+1});};
  this.sess.doc.on('update',onUpdate);
  const onAware=({added,updated,removed}:{added:number[];updated:number[];removed:number[]},origin:unknown)=>{
   if(origin!==this&&this.open())this.sendFrame(encodeAwareness(this.sess.awareness,added.concat(updated,removed)));};
  this.sess.awareness.on('update',onAware);
  this.offDoc=()=>this.sess.doc.off('update',onUpdate);
  this.offAware=()=>this.sess.awareness.off('update',onAware);}

 private open(){return this.transport!==null&&this.ready;}
 private patch(p:Partial<CollabClientSnapshot>){this.s={...this.s,...p};this.ls.forEach(l=>l());}
 subscribe(l:()=>void){this.ls.add(l);return()=>{this.ls.delete(l);};}
 snapshot():CollabClientSnapshot{return this.s;}

 async connect():Promise<void>{
  if(this.s.state!=='idle'&&this.s.state!=='error')throw new Error('already connecting or connected');
  const parsed=parseWireInvite(this.invite);
  if(!parsed){this.patch({state:'error',error:{kind:'bad-link',message:'That does not look like a Somnia invite link.'}});throw new Error('bad-link');}
  const expiry=roomExpiry(parsed.url);
  this.managed=expiry!==null;this.acknowledged=false;
  if(expiry!==null&&expiry<=Date.now()){
   this.patch({state:'error',error:{kind:'expired',message:'This session has expired.'}});throw new Error('expired');
  }
  if(expiry!==null)this.expiryTimer=setTimeout(()=>{
   const t=this.transport;this.transport=null;this.ready=false;
   if(this.timer){clearTimeout(this.timer);this.timer=null;}
   this.patch({state:'error',synced:false,error:{kind:'expired',message:'This session has expired.'}});
   const fail=this.connectFail;this.connectDone=this.connectFail=null;fail?.(new Error('expired'));
   t?.close(4004,'session expired');
  },expiry-Date.now());
  const keyParam=linkKeyParam(parsed.url);
  this.linkKey=keyParam?await importLinkKey(keyParam):null;
  this.patch({state:'connecting',attempt:1,error:null,synced:false,chatSynced:false,
   security:{e2e:this.linkKey!==null,keyFingerprint:this.linkKey?.fingerprint??null,secureChannel:parsed.secure,insecureRemote:isInsecureRemote(parsed)}});
  this.intentional=false;
  return new Promise<void>((resolve,reject)=>{this.connectDone=resolve;this.connectFail=reject;this.dial(parsed.url);});}

 private dial(url:string){
  this.acknowledged=false;
  const t=this.transport=this.tf(url);this.ready=false;
  t.connect({
   onOpen:()=>{
    this.ready=true;this.lastActivity=Date.now();this.armHeartbeat();
    if(this.managed){this.armSyncTimeout(t);return;}
    this.beginSync(t);},
   onMessage:bytes=>{this.lastActivity=Date.now();void this.onFrame(bytes);},
   onClose:(code,reason)=>{if(this.transport===t)this.onClose(code,reason);}});}

 /** Ping every heartbeatMs; when nothing came back within heartbeatDeadMs, treat the socket as dead and close it (reconnectable). */
 private armHeartbeat(){
  if(this.heartbeatTimer){clearInterval(this.heartbeatTimer);this.heartbeatTimer=null;}
  if(this.o.heartbeatMs<=0)return;
  this.heartbeatTimer=setInterval(()=>{
   const t=this.transport;if(!t||!this.ready)return;
   if(Date.now()-this.lastActivity>this.o.heartbeatDeadMs){this.lastActivity=Date.now();t.close(4005,'heartbeat timeout');return;}
   this.sendFrame(encodePing());},this.o.heartbeatMs);
  // a liveness timer must never hold the process open (tests, node hosts)
  const t=this.heartbeatTimer as unknown as {unref?:()=>void};t.unref?.();}
 private stopHeartbeat(){if(this.heartbeatTimer){clearInterval(this.heartbeatTimer);this.heartbeatTimer=null;}}

 private beginSync(t:Transport){
    for(const u of this.outbox.splice(0))this.sendFrame(encodeUpdate(u));
    this.patch({queued:0});
    this.sendFrame(encodeSyncStep1(this.sess.doc));
    if(this.chatDoc&&this.linkKey&&!this.chatDoc.isDestroyed){this.sendFrame(chatStep1(this.chatDoc));this.sendFrame(chatUpdate(Y.encodeStateAsUpdate(this.chatDoc)));}
    if(this.sess.awareness.getLocalState())this.sendFrame(encodeAwareness(this.sess.awareness,[this.sess.doc.clientID]));
    this.armSyncTimeout(t);}


 private armSyncTimeout(t:Transport){
  this.timer=setTimeout(()=>{if(this.transport===t&&!this.s.synced){
   if(this.managed&&!this.acknowledged){this.ready=false;t.close(4003,'managed rooms unsupported');
    this.onClose(4003,'managed rooms unsupported');return;}
   this.markSynced();}},this.o.syncTimeoutMs);}
 /** Chat history rides its own step1/step2 after the project sync. With no chat doc or no peer to answer, stop waiting after syncTimeoutMs. */
 private armChatSync(){
  if(this.s.chatSynced)return;
  if(!this.chatDoc||!this.linkKey){this.patch({chatSynced:true});return;}
  const t=this.transport;
  if(this.chatTimer)clearTimeout(this.chatTimer);
  this.chatTimer=setTimeout(()=>{this.chatTimer=null;if(this.transport===t&&!this.s.chatSynced)this.patch({chatSynced:true});},this.o.syncTimeoutMs);}
 private markSynced(){
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  this.patch({synced:true,state:'connected',attempt:0});
  this.armChatSync();
  const r=this.connectDone;this.connectDone=this.connectFail=null;r?.();}

 private async onFrame(bytes:Uint8Array){
  const transport=this.transport;
  try{
   if(!this.open())return;
   if(this.managed&&!this.acknowledged){
    if(bytes.length===MANAGED_ACK.length&&bytes.every((v,i)=>v===MANAGED_ACK[i])){
     this.acknowledged=true;if(this.timer){clearTimeout(this.timer);this.timer=null;}
     this.beginSync(this.transport!);
    }
    return;
   }
   if(bytes[0]===MSG_IDENTITY){this.onIdentity(readIdentity(bytes));return;}
   let frame=bytes;
   if(isEncryptedFrame(bytes)){
    if(!this.linkKey)return; // encrypted traffic without a key: not for us, drop
    frame=await decryptFrame(this.linkKey,bytes);}
   else if(this.linkKey)return; // key session: plaintext sync/awareness is a downgrade attempt, drop
   if(this.transport!==transport||!this.open())return;
   if(frame[0]===MSG_SYNC_CHUNK){
    const c=decodeSyncChunk(frame);if(!c)return;
    const now=Date.now();
    for(const [k,v] of this.syncChunks)if(now-v.at>60_000)this.syncChunks.delete(k);   // stale partial batches go away
    if(this.syncChunks.size>=8&&!this.syncChunks.has(c.batch))return;                 // bound memory: at most 8 open batches
    const b=this.syncChunks.get(c.batch)??{count:c.count,parts:new Map(),at:now};
    if(b.count!==c.count)return;                                                       // batch id reuse with another shape: refuse
    b.at=now;b.parts.set(c.index,c.payload);this.syncChunks.set(c.batch,b);
    if(b.parts.size<b.count)return;
    this.syncChunks.delete(c.batch);
    const whole=new Uint8Array(b.count*SYNC_CHUNK_BYTES);let len=0;
    for(let i=0;i<b.count;i++){whole.set(b.parts.get(i)!,i*SYNC_CHUNK_BYTES);len+=b.parts.get(i)!.length;}
    const assembled=whole.subarray(0,len);
    if(assembled[0]!==MSG_SYNC)return;
    const reply=handleMessage(assembled,this.sess.doc,this.sess.awareness,this);
    if(reply)this.sendFrame(reply);
    if(!this.s.synced&&peekSyncType(assembled)===1)this.markSynced();
    return;}
   if(frame[0]===MSG_PING){this.sendFrame(encodePong());return;}
   if(frame[0]===MSG_PONG)return;
   if(frame[0]===MSG_CHAT_SYNC){if(!this.linkKey||!this.chatDoc||this.chatDoc.isDestroyed)return;const reply=handleChatFrame(frame,this.chatDoc,this);if(reply)this.sendFrame(reply);if(!this.s.chatSynced&&peekChatSyncType(frame)===1){if(this.chatTimer){clearTimeout(this.chatTimer);this.chatTimer=null;}this.patch({chatSynced:true});}return;}
   if(frame[0]===MSG_BLOB){this.blobHandler?.(frame);return;}
   if(frame[0]!==MSG_SYNC&&frame[0]!==MSG_AWARENESS)return;
   const reply=handleMessage(frame,this.sess.doc,this.sess.awareness,this);
   if(reply)this.sendFrame(reply);
   if(!this.s.synced&&peekSyncType(frame)===1)this.markSynced();
  }catch{/* one bad frame must not kill the session; the relay drops us itself when we send one */}}

 private onIdentity(msg:IdentityMessage|null){
  if(!msg)return;
  if(msg.type==='identity')this.patch({identity:msg.identity});
  else if(msg.type==='presence')this.patch({people:msg.people});}

 private onClose(code:number,reason:string){
  if(this.s.error?.kind==='expired')return;
  this.stopHeartbeat();
  this.transport=null;this.ready=false;
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  if(this.chatTimer){clearTimeout(this.chatTimer);this.chatTimer=null;}
  this.patch({synced:false,chatSynced:false});
  const fail=(kind:CollabError['kind'],message:string)=>{
   if(this.expiryTimer){clearTimeout(this.expiryTimer);this.expiryTimer=null;}
   this.patch({state:'error',error:{kind,message}});
   const r=this.connectFail;this.connectDone=this.connectFail=null;r?.(new Error(message));};
  if(this.intentional){this.patch({state:'idle'});return;}
  if(code===4004)return fail('expired','This session has expired.');
  if(reason==='managed rooms unsupported')return fail('unsupported-relay','This relay does not support managed sessions. Update the self-hosted relay.');
  if(CLOSE_REFUSED.includes(code))return fail('refused','The host ended this session or revoked the invite. Ask for a new one.');
  if(code===CLOSE_BLOCKED)return fail('blocked','The host rate-limited this connection. Wait and ask the host.');
  if(code===CLOSE_PROTOCOL)return fail('refused','The host closed the connection on a protocol error.');
  if(code===CLOSE_TOO_BIG)return fail('refused','One edit was larger than the relay\'s 2 MiB frame limit and was rejected.');
  const attempt=this.s.attempt;
  if(attempt>=this.o.maxAttempts)return fail('unreachable','Could not reach the host. Check the link and that the host is still sharing.');
  this.patch({state:'reconnecting',attempt:attempt+1});
  const r=this.o.random?.()??Math.random();
  const delay=Math.min(this.o.maxDelayMs,this.o.baseDelayMs*2**(attempt-1))*(0.75+0.5*r);
  this.timer=setTimeout(()=>{const p=parseWireInvite(this.invite);if(p)this.dial(p.url);},delay);}

 /** Ordered, encrypted send. Sync/awareness frames are encrypted when the link carries a key; identity never is. */
 private sendFrame(frame:Uint8Array){
  // A document frame over the relay cap is split; the receiver reassembles (Relay-Wire-Contract: 1009 over 2 MiB).
  if(frame[0]===MSG_SYNC&&frame.length>MAX_RELAY_FRAME_BYTES-1024){
   const batch=`${this.sess.doc.clientID.toString(36)}-${(this.chunkSeq++).toString(36)}`;
   const parts=Math.ceil(frame.length/SYNC_CHUNK_BYTES);
   for(let i=0;i<parts;i++)this.sendFrame(encodeSyncChunk(batch,i,parts,frame.subarray(i*SYNC_CHUNK_BYTES,(i+1)*SYNC_CHUNK_BYTES)));
   return;}
  // Never let a growing volatile chat snapshot take the project socket down with 1009.
  // Epoch compaction is a follow-up; oversized chat frames stay local rather than claiming delivery.
  if(frame[0]===MSG_CHAT_SYNC&&frame.length>MAX_RELAY_FRAME_BYTES-64)return;
  const t=this.transport;if(!t||!this.ready||(this.managed&&!this.acknowledged))return;
  this.sendChain=this.sendChain.then(async()=>{
   if(!this.ready||this.transport!==t)return;
   const key=(frame[0]===MSG_SYNC||frame[0]===MSG_AWARENESS||frame[0]===MSG_BLOB||frame[0]===MSG_CHAT_SYNC||frame[0]===MSG_PING||frame[0]===MSG_PONG||frame[0]===MSG_SYNC_CHUNK)?this.linkKey:null;
   const bytes=key?await encryptFrame(key,frame):frame;
   if(this.ready&&this.transport===t)t.send(bytes);});}

 /** Media blob frames (collab-files). Returns false when the socket is not open; blob transfer retries by itself. */
 sendBlob(frame:Uint8Array):boolean{if(!this.open())return false;this.sendFrame(frame);return true;}
 setBlobHandler(fn:((frame:Uint8Array)=>void)|null){this.blobHandler=fn;}
 private blobHandler:((frame:Uint8Array)=>void)|null=null;
 /** Host-only relay commands. A guest sending these is dropped by the relay. */
 setGuestRole(id:string,role:'editor'|'viewer'){this.hostCommand({type:'set-role',id,role});}
 revokeGuest(id:string){this.hostCommand({type:'revoke',id});}
 private hostCommand(cmd:IdentityMessage){
  if(this.s.identity?.role!=='host'||!this.open())throw new Error('host connection required');
  this.sendFrame(encodeIdentity(cmd));}

 leave(){
  this.intentional=true;
  this.stopHeartbeat();
  if(this.expiryTimer){clearTimeout(this.expiryTimer);this.expiryTimer=null;}
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  this.transport?.close(1000,'leave');this.transport=null;this.ready=false;
  this.offDoc();this.offAware();this.offChat();
  this.outbox=[];
  if(this.chatTimer){clearTimeout(this.chatTimer);this.chatTimer=null;}this.patch({state:'idle',synced:false,chatSynced:false,identity:null,people:[],queued:0});
  const r=this.connectFail;this.connectDone=this.connectFail=null;r?.(new Error('left before sync'));}}
