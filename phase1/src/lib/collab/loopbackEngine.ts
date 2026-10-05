import type {CollabEngine,CollabSnapshot,GuestRole,Invite,CollabError} from './types';
import {parseInviteLink,cleanDisplayName} from './invite';
/**
 * In-memory stand-in for the relay. It follows the same rules the spike relay enforces (codes per role,
 * expiry, 5 bad tries then blocked, max clients) so the UI can be built and tested without a network.
 * Used in dev builds and tests only; the real engine replaces it via setCollabEngine().
 */
const rand=()=>{const a=new Uint8Array(16);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
export class LoopbackEngine implements CollabEngine{
 private s:CollabSnapshot={host:{state:'off',invites:[],participants:[],lan:false,error:null},guest:{state:'idle',role:null,hostName:null,error:null}};
 private ls=new Set<()=>void>();private codes:Record<GuestRole,string>={editor:'',viewer:''};private fails=0;private port=48201;
 constructor(private o:{now?:()=>number;maxClients?:number;delayMs?:number}={}){}
 private now=()=>this.o.now?.()??Date.now();
 private wait=()=>new Promise(r=>setTimeout(r,this.o.delayMs??0));
 private emit(){this.s={host:{...this.s.host},guest:{...this.s.guest}};this.ls.forEach(l=>l());}
 subscribe(l:()=>void){this.ls.add(l);return()=>{this.ls.delete(l);};}
 snapshot(){return this.s;}
 private invite(role:GuestRole,ttl:number):Invite{this.codes[role]=rand();const h=this.s.host.lan?'192.168.1.20':'127.0.0.1';return {role,link:`ws://${h}:${this.port}/?code=${this.codes[role]}`,expiresAt:this.now()+ttl};}
 async startHosting({lan,ttlMs}:{lan:boolean;ttlMs:number}){
  this.s.host.state='starting';this.s.host.error=null;this.emit();await this.wait();
  this.s.host.lan=lan;this.fails=0;
  this.s.host.invites=[this.invite('editor',ttlMs),this.invite('viewer',ttlMs)];
  this.s.host.participants=[{id:'host',name:'You',role:'host',online:true}];this.s.host.state='live';this.emit();}
 async stopHosting(){this.s.host={state:'off',invites:[],participants:[],lan:false,error:null};this.codes={editor:'',viewer:''};this.emit();}
 async renewInvite(role:GuestRole,ttlMs:number){if(this.s.host.state!=='live')return;this.s.host.invites=this.s.host.invites.map(i=>i.role===role?this.invite(role,ttlMs):i);this.emit();}
 async join(link:string,displayName:string){
  const fail=(kind:CollabError['kind'],message:string)=>{this.s.guest={state:'error',role:null,hostName:null,error:{kind,message}};this.emit();};
  const p=parseInviteLink(link);if(!p)return fail('bad-link','That does not look like a Somnia invite link.');
  this.s.guest={state:'connecting',role:null,hostName:null,error:null};this.emit();await this.wait();
  if(this.s.host.state!=='live')return fail('unreachable','Could not reach the host. Check the link and that the host is still sharing.');
  if(this.fails>=5)return fail('blocked','Too many wrong codes. Ask the host to restart sharing.');
  const inv=this.s.host.invites.find(i=>this.codes[i.role]===p.code);
  if(!inv){this.fails++;return fail('refused','The host did not accept this code. Ask for a new invite link.');}
  if(this.now()>inv.expiresAt)return fail('expired','This invite has expired. Ask the host for a new one.');
  if(this.s.host.participants.filter(x=>x.online).length>=(this.o.maxClients??8))return fail('full','This session is full.');
  this.s.host.participants=[...this.s.host.participants,{id:rand().slice(0,6),name:cleanDisplayName(displayName),role:inv.role,online:true}];
  this.s.guest={state:'connected',role:inv.role,hostName:'Host',error:null};this.emit();}
 async leave(){this.s.guest={state:'idle',role:null,hostName:null,error:null};this.emit();}
}
