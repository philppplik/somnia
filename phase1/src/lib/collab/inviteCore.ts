export interface ParsedInvite{url:string;host:string;secure:boolean;local:boolean;code:string}
const LOCAL=/^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i;
/** Old spike form: ws://host:port/?code=... Kept so the protocol client still reads it. */
export function parseInviteLink(input:string):ParsedInvite|null{
 const text=input.trim();if(!text||text.length>600||/\s/.test(text))return null;
 let u:URL;try{u=new URL(text);}catch{return null;}
 if(u.protocol!=='ws:'&&u.protocol!=='wss:')return null;
 if(u.username||u.password||!u.hostname)return null;
 const code=u.searchParams.get('code');if(!code||!/^[A-Za-z0-9_-]{16,64}$/.test(code))return null;
 return {url:u.toString(),host:u.host,secure:u.protocol==='wss:',local:LOCAL.test(u.hostname),code};}
/** Plain ws:// to another machine is not TLS. With a #key the content is still encrypted end to end; without one it is readable on the path. */
export const isInsecureRemote=(p:ParsedInvite)=>!p.secure&&!p.local;
