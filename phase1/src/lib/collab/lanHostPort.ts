/**
 * Port to the desktop LAN host (Rust, owned by the collab-lan slice). The engine only knows this shape;
 * the desktop build registers the real implementation. In a plain browser nothing is registered and the
 * UI says so - LAN-Direct needs the desktop app.
 */
export interface LanHostInfo{running:boolean;lan:boolean;port:number;localUrl:string;guestUrls:string[];roomId:string}
export interface LanSessionLinks{localLink:string;guestLinks:string[];keyFingerprint:string}
export interface LanHostPort{
 startLanHost(opts:{lan:boolean;port:number}):Promise<LanHostInfo>;
 stopLanHost():Promise<void>;
 /** One shared AES key for all interfaces; localLink is for the host's own connection. */
 createLanSessionLinks(info:LanHostInfo):Promise<LanSessionLinks>|LanSessionLinks;
}
let port:LanHostPort|null=null;
export const registerLanHost=(p:LanHostPort|null)=>{port=p;};
export const getLanHost=()=>port;
