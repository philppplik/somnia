import type {GuestRole} from './types';
export const INVITE_TTL_OPTIONS=[{label:'15 minutes',ms:15*60_000},{label:'1 hour',ms:3600_000},{label:'8 hours',ms:8*3600_000}] as const;
export const DEFAULT_TTL_MS=3600_000;
export interface ParsedInvite{url:string;host:string;secure:boolean;local:boolean;code:string}
const LOCAL=/^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i;
/** Accepts what the host hands out: ws://host:port/?code=... or wss://... Whitespace around it is ignored. */
export function parseInviteLink(input:string):ParsedInvite|null{
 const text=input.trim();if(!text||text.length>600||/\s/.test(text))return null;
 let u:URL;try{u=new URL(text);}catch{return null;}
 if(u.protocol!=='ws:'&&u.protocol!=='wss:')return null;
 if(u.username||u.password||!u.hostname)return null;
 const code=u.searchParams.get('code');if(!code||!/^[A-Za-z0-9_-]{16,64}$/.test(code))return null;
 return {url:u.toString(),host:u.host,secure:u.protocol==='wss:',local:LOCAL.test(u.hostname),code};}
/** Plain ws:// to another machine can be read on shared Wi-Fi. Warn, do not block. */
export const isInsecureRemote=(p:ParsedInvite)=>!p.secure&&!p.local;
export const roleLabel=(r:GuestRole|'host')=>r==='host'?'Host':r==='editor'?'Can edit':'View only';
/** Short, safe-to-show form of a link: the code is hidden until the user reveals or copies it. */
export const maskLink=(link:string)=>link.replace(/code=([A-Za-z0-9_-]{4})[A-Za-z0-9_-]*/,'code=$1\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022');
export function timeLeft(expiresAt:number,now=Date.now()){
 const s=Math.max(0,Math.round((expiresAt-now)/1000));if(s<=0)return 'expired';
 const m=Math.ceil(s/60);return m<60?`${m} min left`:`${Math.floor(m/60)} h ${m%60} min left`;}
export function cleanDisplayName(n:string){return n.replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,32)||'Guest';}
