import type {Awareness} from 'y-protocols/awareness';
import type {Participant} from './types';
import {cleanDisplayName} from './invite';
/** Awareness states come from other people's machines. Names are clamped, colours must be #rrggbb, everything else is dropped before it reaches the UI or the editor's cursor styles. */
export interface SafeUser{name:string;color:string;colorLight:string}
const HEX=/^#[0-9a-f]{6}$/i;
export const PALETTE=['#7c5cff','#e5484d','#12a594','#f76b15','#0090ff','#d6409f','#46a758','#ab6400'];
export const colorFor=(id:number)=>PALETTE[Math.abs(id)%PALETTE.length];
export function safeUser(raw:unknown,clientId:number):SafeUser{
 const r=(raw&&typeof raw==='object'?raw:{}) as {name?:unknown;color?:unknown};
 const name=typeof r.name==='string'?cleanDisplayName(r.name):'Guest';
 const color=typeof r.color==='string'&&HEX.test(r.color)?r.color:colorFor(clientId);
 return {name,color,colorLight:color+'33'};}
export const makeUser=(name:string,clientId:number):SafeUser=>safeUser({name,color:colorFor(clientId)},clientId);
/**
 * Read-only view for the editor's remote cursors: same awareness, but every remote `user` field is sanitised
 * and `cursor` must be a plain {anchor,head} object. Local writes pass straight through.
 */
export function safeAwareness(a:Awareness):Awareness{
 const clean=(state:Record<string,unknown>,id:number)=>{
  if(id===a.clientID)return state;
  const out:Record<string,unknown>={user:safeUser(state.user,id)};
  if(state.cursor)out.cursor=state.cursor;return out;};
 return new Proxy(a,{get(t,p){
  if(p==='getStates')return()=>{const m=new Map<number,Record<string,unknown>>();t.getStates().forEach((s,id)=>m.set(id,clean(s,id)));return m;};
  const v=(t as unknown as Record<string|symbol,unknown>)[p];return typeof v==='function'?(v as (...x:unknown[])=>unknown).bind(t):v;}});}
export function participantsOf(a:Awareness):Participant[]{
 const out:Participant[]=[];
 a.getStates().forEach((s,id)=>{if(!s||!s.user)return;const u=safeUser(s.user,id);out.push({id:String(id),name:u.name,color:u.color,self:id===a.clientID});});
 return out.sort((x,y)=>Number(y.self)-Number(x.self)||x.name.localeCompare(y.name));}
