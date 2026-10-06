/** Managed room v1: expiry and host capability are bound into the public room id.
 * The AES key stays in #key; the host-only capability is a different random secret.
 */
import {toBase64Url} from './net/crypto';
export const DEFAULT_SESSION_MINUTES=60;
export const roomExpiry=(link:string):number|null=>{
 try {const m=new URL(link).pathname.match(/^\/room\/m1_(\d{10})_[a-f0-9]{64}$/);return m?Number(m[1])*1000:null;}catch{return null;}
};
export async function managedRoomId(expiresAt:number){
 const expires=Math.floor(expiresAt/1000);
 if(!Number.isSafeInteger(expires)||expires<=Math.floor(Date.now()/1000)||expires>Math.floor(Date.now()/1000)+86400)throw new Error('Session lifetime must be between 1 minute and 24 hours.');
 const raw=new Uint8Array(32);crypto.getRandomValues(raw);const capability=toBase64Url(raw);
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`somnia-room-v1:${expires}:${capability}`)));
 return {id:`m1_${expires}_${[...digest].map(b=>b.toString(16).padStart(2,'0')).join('')}`,capability};
}
export async function secureRoomLinks(hostLink:string,guestLinks:string[],expiresAt:number,room?:{id:string;capability:string}){
 const {id,capability}=room??await managedRoomId(expiresAt);
 const wrap=(link:string,host:boolean)=>{const u=new URL(link);u.pathname=`/room/${id}`;u.search='';if(host)u.searchParams.set('host',capability);return u.toString();};
 return {hostLink:wrap(hostLink,true),guestLinks:guestLinks.map(l=>wrap(l,false))};
}
