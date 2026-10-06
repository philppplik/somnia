import type {Awareness} from 'y-protocols/awareness';
import type {Participant} from './types';
import {PERSON_LIGHT,PERSON_DARK,tokenFor} from './badgePolicy';
import {cleanDisplayName} from './invite';
/** Awareness states come from other people's machines. Names are clamped, colours must be #rrggbb, everything else is dropped before it reaches the UI or the editor's cursor styles. */
export interface SafeUser{name:string;color:string;colorLight:string;participantId?:string}
const HEX=/^#[0-9a-f]{6}$/i;
export const PALETTE=['#7c5cff','#e5484d','#12a594','#f76b15','#0090ff','#d6409f','#46a758','#ab6400'];
export const colorFor=(id:number)=>PALETTE[Math.abs(id)%PALETTE.length];
export function safeUser(raw:unknown,clientId:number):SafeUser{
 const r=(raw&&typeof raw==='object'?raw:{}) as {name?:unknown;color?:unknown;participantId?:unknown};
 const name=typeof r.name==='string'?cleanDisplayName(r.name):'Guest';
 const color=typeof r.color==='string'&&HEX.test(r.color)?r.color:colorFor(clientId);
 return {name,color,colorLight:color+'38',...(typeof r.participantId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(r.participantId)?{participantId:r.participantId}:{})};}
export const makeUser=(name:string,clientId:number):SafeUser=>{const participantId=crypto.randomUUID();return safeUser({name,participantId,color:PERSON_LIGHT[tokenFor(participantId)]},clientId);};
/**
 * Read-only view for the editor's remote cursors: same awareness, but every remote `user` field is sanitised
 * and `cursor` must be a plain {anchor,head} object. Local writes pass straight through.
 */
function validPosition(v:unknown){if(!v||typeof v!=='object'||Array.isArray(v))return false;const p=v as Record<string,unknown>;if(p.assoc!==undefined&&(!Number.isInteger(p.assoc)||Math.abs(p.assoc as number)>1))return false;const id=(x:unknown)=>{if(!x||typeof x!=='object')return false;const i=x as Record<string,unknown>;return Number.isSafeInteger(i.client)&&Number.isSafeInteger(i.clock)&&(i.client as number)>=0&&(i.clock as number)>=0;};return (p.type!==undefined?id(p.type):typeof p.tname==='string'&&p.tname.length<=180)&&(p.item===null||p.item===undefined||id(p.item));}
export function safeAwareness(a:Awareness,file?:string,colour?:(id:string)=>number|undefined):Awareness{
 const clean=(state:Record<string,unknown>,id:number)=>{
  if(id===a.clientID)return state;
  const u=safeUser(state.user,id),token=colour?.(u.participantId??String(id))??tokenFor(u.participantId??String(id));
  const dark=typeof document!=='undefined'&&document.documentElement.dataset.theme==='dark';const color=(dark?PERSON_DARK:PERSON_LIGHT)[token];
  const out:Record<string,unknown>={user:{...u,color,colorLight:color+'38',token}};
  if(state.cursor&&(!file||state.file===file)){const c=state.cursor as Record<string,unknown>;if(c&&typeof c==='object'&&validPosition(c.anchor)&&validPosition(c.head))out.cursor={anchor:c.anchor,head:c.head};}
  if(typeof state.activity==='number')out.activity=state.activity;return out;};
 return new Proxy(a,{get(t,p){
  if(p==='getStates')return()=>{const m=new Map<number,Record<string,unknown>>();t.getStates().forEach((s,id)=>m.set(id,clean(s,id)));return m;};
  const v=(t as unknown as Record<string|symbol,unknown>)[p];return typeof v==='function'?(v as (...x:unknown[])=>unknown).bind(t):v;}});}
export function participantsOf(a:Awareness):Participant[]{
 const out:Participant[]=[];
 a.getStates().forEach((s,id)=>{if(!s||!s.user)return;const u=safeUser(s.user,id);out.push({id:String(id),name:u.name,color:u.color,self:id===a.clientID});});
 return out.sort((x,y)=>Number(y.self)-Number(x.self)||x.name.localeCompare(y.name));}
