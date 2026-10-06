import {parseWireInvite,type CollabMode} from './net/client';
import {linkKeyParam} from './net/crypto';
import {isInsecureRemote} from './inviteCore';
import type {ParsedInvite} from './inviteCore';
export type {ParsedInvite};
export {isInsecureRemote};
export const RELAY_URL_KEY='somnia.collab.relayUrl';
/** Accepts what a host hands out: `ws(s)://host:port/room/<id>#key=...` (relay / LAN host) or the old `?code=` form. */
export const parseJoinLink=(input:string):ParsedInvite|null=>parseWireInvite(input);
export const hasLinkKey=(link:string)=>linkKeyParam(link.trim())!==null;
const PRIVATE=/^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|[^.]+\.local)$/i;
/** Mode label for a guest. The host writes it into the link fragment (`&m=lan` / `&m=relay`); links without it fall back to the address (private/loopback/.local = LAN-Direct, anything else = relay). It is a label only, nothing in the wire protocol depends on it. */
export const modeOfLink=(link:string):CollabMode=>{try{const u=new URL(link.trim());const m=u.hash.replace(/^#/,'').split('&').find(x=>x.startsWith('m='));if(m==='m=lan')return 'lan-direct';if(m==='m=relay')return 'relay';return PRIVATE.test(u.hostname)?'lan-direct':'relay';}catch{return 'relay';}};
/** Add the mode label to a link that already has a #key= fragment. */
export const withMode=(link:string,mode:CollabMode)=>/[#&]m=/.test(link)?link:`${link}${link.includes('#')?'&':'#'}m=${mode==='lan-direct'?'lan':'relay'}`;
/** Hide the secrets of a link: the key after #key= and the room id / code. The first 4 characters stay so people can tell links apart. */
export const maskLink=(link:string)=>link
 .replace(/#key=([A-Za-z0-9_-]{4})[A-Za-z0-9_-]*/,'#key=$1\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022')
 .replace(/code=([A-Za-z0-9_-]{4})[A-Za-z0-9_-]*/,'code=$1\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022')
 .replace(/\/room\/([A-Za-z0-9_-]{4})[A-Za-z0-9_-]*/,'/room/$1\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022');
export function cleanDisplayName(n:string){return n.replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,32)||'Guest';}
/** 24 chars = 144 bits of entropy; the room id is the relay's only access credential (Relay-Wire-Contract v0, 8-128 chars). */
export function newRoomId():string{const a=new Uint8Array(18);globalThis.crypto.getRandomValues(a);let s='';for(const b of a)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
/** Turn what the user typed into `ws(s)://host[:port]/room/<fresh id>`. Accepts a base URL or an https/http URL; an explicit /room/<id> path is kept. Returns null when it is not usable. */
export function relayRoomUrl(input:string,roomId=newRoomId()):{url:string;local:boolean;secure:boolean}|null{
 const text=input.trim();if(!text||text.length>300||/\s/.test(text))return null;
 let u:URL;try{u=new URL(/^[a-z]+:\/\//i.test(text)?text:`wss://${text}`);}catch{return null;}
 if(u.protocol==='https:')u.protocol='wss:';else if(u.protocol==='http:')u.protocol='ws:';
 if(u.protocol!=='ws:'&&u.protocol!=='wss:')return null;
 if(u.username||u.password||!u.hostname)return null;
 u.search='';u.hash='';
 if(!/^\/room\/[A-Za-z0-9_-]{8,128}$/.test(u.pathname)){u.pathname=u.pathname.replace(/\/+$/,'')+`/room/${roomId}`;}
 const local=/^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i.test(u.hostname);
 return {url:u.toString(),local,secure:u.protocol==='wss:'};}
