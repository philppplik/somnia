import {invoke, isTauri} from '@tauri-apps/api/core';
import {newLinkKey} from './net/crypto';
export interface LanHostSettingsValue {lan:boolean;port:number}
export interface LanHostInfo {
 running:boolean;lan:boolean;port:number;localUrl:string;guestUrls:string[];roomId:string;
}
export type LanHostInvoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
const desktopInvoke:LanHostInvoke=(command,args)=>{
 if(!isTauri())return Promise.reject(new Error('LAN hosting needs the Somnia desktop app. No server was started.'));
 return invoke(command,args);
};
/** Injectable command boundary for tests; production always invokes the actual desktop server. */
export function lanHostAdapter(call:LanHostInvoke=desktopInvoke){
 return {
  start:({lan,port}:LanHostSettingsValue):Promise<LanHostInfo>=>{
   if(!Number.isInteger(port)||port<0||port>65535)return Promise.reject(new Error('Port must be 0 (automatic) or an integer from 1 to 65535.'));
   return call<LanHostInfo>('collab_lan_start',{lan,port});
  },
  stop:()=>call<void>('collab_lan_stop'),
  status:()=>call<LanHostInfo>('collab_lan_status'),
 };
}
const adapter=lanHostAdapter();
export const startLanHost=adapter.start;
export const stopLanHost=adapter.stop;
export const getLanHostStatus=adapter.status;
function checkedRoomUrl(input:string):URL{
 const url=new URL(input);
 if(url.protocol!=='ws:'||url.username||url.password||!/^\/room\/[A-Za-z0-9_-]{8,128}$/.test(url.pathname)||url.search||url.hash)
  throw new Error('Expected a plain LAN room URL without a key or query.');
 return url;
}
/** All addresses of ONE session must use ONE key. Keep the returned localLink on the host,
 * and pass a guestLink to guests. No key is sent to Rust or put in the URL query. */
export async function createLanSessionLinks(info:LanHostInfo):Promise<{localLink:string;guestLinks:string[];keyFingerprint:string}>{
 if(!info.running)throw new Error('Sharing is not running.');
 const urls=[info.localUrl,...info.guestUrls].map(checkedRoomUrl);
 if(urls.some(u=>u.pathname!==`/room/${info.roomId}`))throw new Error('Addresses do not belong to this session.');
 const {param,link}=await newLinkKey();
 for(const url of urls)url.hash=`key=${param}`;
 return {localLink:urls[0].toString(),guestLinks:urls.slice(1).map(u=>u.toString()),keyFingerprint:link.fingerprint};
}
/** Single-address convenience. Do not call once per interface: that would produce different keys. */
export async function createLanInvite(url:string):Promise<{link:string;keyFingerprint:string}>{
 const u=checkedRoomUrl(url);const {param,link}=await newLinkKey();u.hash=`key=${param}`;
 return {link:u.toString(),keyFingerprint:link.fingerprint};
}
