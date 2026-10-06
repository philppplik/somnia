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
import type * as Y from 'yjs';
import type {Awareness} from 'y-protocols/awareness';
import {MSG_SYNC,MSG_AWARENESS,MSG_IDENTITY,encodeSyncStep1,encodeUpdate,encodeAwareness,encodeIdentity,peekSyncType,readIdentity,handleMessage} from './protocol';
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
 random?:()=>number;    // jitter source, tests
}
export interface CollabClientSnapshot{
 state:ClientState;mode:CollabMode;synced:boolean;attempt:number;
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
 private offAware:()=>void;
 private tf:TransportFactory;
 private sess:CollabSession;
 private o:{maxAttempts:number;baseDelayMs:number;maxDelayMs:number;syncTimeoutMs:number;outboxLimit:number;random?:()=>number};

 constructor(private invite:string,opts:CollabClientOptions){
  this.sess=opts.session;
  this.o={maxAttempts:opts.maxAttempts??6,baseDelayMs:opts.baseDelayMs??500,maxDelayMs:opts.maxDelayMs??15_000,
   syncTimeoutMs:opts.syncTimeoutMs??2_000,outboxLimit:opts.outboxLimit??1_000,random:opts.random};
  this.tf=opts.transport??webSocketTransport;
  this.s={state:'idle',mode:opts.mode??'lan-direct',synced:false,attempt:0,identity:null,people:[],error:null,
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
  this.patch({state:'connecting',attempt:1,error:null,synced:false,
   security:{e2e:this.linkKey!==null,keyFingerprint:this.linkKey?.fingerprint??null,secureChannel:parsed.secure,insecureRemote:isInsecureRemote(parsed)}});
  this.intentional=false;
  return new Promise<void>((resolve,reject)=>{this.connectDone=resolve;this.connectFail=reject;this.dial(parsed.url);});}

 private dial(url:string){
  this.acknowledged=false;
  const t=this.transport=this.tf(url);this.ready=false;
  t.connect({
   onOpen:()=>{
    this.ready=true;
    if(this.managed){this.armSyncTimeout(t);return;}
    this.beginSync(t);},
   onMessage:bytes=>{void this.onFrame(bytes);},
   onClose:(code,reason)=>{if(this.transport===t)this.onClose(code,reason);}});}

 private beginSync(t:Transport){
    for(const u of this.outbox.splice(0))this.sendFrame(encodeUpdate(u));
    this.patch({queued:0});
    this.sendFrame(encodeSyncStep1(this.sess.doc));
    if(this.sess.awareness.getLocalState())this.sendFrame(encodeAwareness(this.sess.awareness,[this.sess.doc.clientID]));
    this.armSyncTimeout(t);}


 private armSyncTimeout(t:Transport){
  this.timer=setTimeout(()=>{if(this.transport===t&&!this.s.synced){
   if(this.managed&&!this.acknowledged){this.ready=false;t.close(4003,'managed rooms unsupported');
    this.onClose(4003,'managed rooms unsupported');return;}
   this.markSynced();}},this.o.syncTimeoutMs);}
 private markSynced(){
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  this.patch({synced:true,state:'connected',attempt:0});
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
  this.transport=null;this.ready=false;
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  this.patch({synced:false});
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
  const t=this.transport;if(!t||!this.ready||(this.managed&&!this.acknowledged))return;
  this.sendChain=this.sendChain.then(async()=>{
   if(!this.ready||this.transport!==t)return;
   const key=(frame[0]===MSG_SYNC||frame[0]===MSG_AWARENESS)?this.linkKey:null;
   const bytes=key?await encryptFrame(key,frame):frame;
   if(this.ready&&this.transport===t)t.send(bytes);});}

 /** Host-only relay commands. A guest sending these is dropped by the relay. */
 setGuestRole(id:string,role:'editor'|'viewer'){this.hostCommand({type:'set-role',id,role});}
 revokeGuest(id:string){this.hostCommand({type:'revoke',id});}
 private hostCommand(cmd:IdentityMessage){
  if(this.s.identity?.role!=='host'||!this.open())throw new Error('host connection required');
  this.sendFrame(encodeIdentity(cmd));}

 leave(){
  this.intentional=true;
  if(this.expiryTimer){clearTimeout(this.expiryTimer);this.expiryTimer=null;}
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  this.transport?.close(1000,'leave');this.transport=null;this.ready=false;
  this.offDoc();this.offAware();
  this.outbox=[];
  this.patch({state:'idle',synced:false,identity:null,people:[],queued:0});
  const r=this.connectFail;this.connectDone=this.connectFail=null;r?.(new Error('left before sync'));}}
