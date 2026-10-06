/** Share/Join UI contract. The UI talks to a CollabEngine; the real engine (realEngine.ts) wraps CollabClient. */
export type CollabMode='lan-direct'|'relay';
/** Connection state of this window's socket. 'off' = not sharing or joined. */
export type ConnState='off'|'starting'|'connecting'|'connected'|'reconnecting'|'error';
export type JoinFailure='bad-link'|'unsupported-relay'|'refused'|'expired'|'blocked'|'unreachable'|'full'|'unsaved-project'|'no-project';
export interface CollabError{kind:JoinFailure|'start-failed';message:string}
export interface Participant{id:string;name:string;color:string;self:boolean}
export interface Security{e2e:boolean;/** 8 hex chars of SHA-256 over the link key, for out-of-band comparison */fingerprint:string|null;secureChannel:boolean;insecureRemote:boolean}
export interface CollabSnapshot{
 role:'none'|'host'|'guest';
 /** Where the bytes go. For a guest this is derived from the address (private/loopback = LAN, else relay). */
 mode:CollabMode|null;
 state:ConnState;
 /** The socket is up, the sync handshake finished AND at least one other person is present. False with state 'connected' = socket open, nobody else here yet (a blind relay cannot tell us more). */
 synced:boolean;
 /** Reconnect attempt counter from the client (1 = first try). */
 attempt:number;
 /** Host: links to hand out (full links incl. #key). Empty when the LAN host found no network address. */
 guestLinks:string[];
 expiresAt?:number;
 /** Host: link that works on this computer only (LAN-Direct). */
 localLink:string|null;
 /** Host in LAN mode but no private IPv4 address found: nothing to hand out. */
 noNetworkAddress:boolean;
 participants:Participant[];
 security:Security|null;
 /** Edits waiting for a connection (not lost; flushed on reconnect). */
 queued:number;
 error:CollabError|null;
}
export type HostOptions=({mode:'lan-direct';lan:boolean;port:number}|{mode:'relay';relayUrl:string})&{sessionMinutes?:number};
export interface CollabEngine{
 startHosting(opts:HostOptions):Promise<void>;
 stopHosting():Promise<void>;
 join(link:string,displayName:string):Promise<void>;
 leave():Promise<void>;
 subscribe(listener:()=>void):()=>void;
 snapshot():CollabSnapshot;
}
export const idleSnapshot=():CollabSnapshot=>({role:'none',mode:null,state:'off',synced:false,attempt:0,guestLinks:[],localLink:null,noNetworkAddress:false,participants:[],security:null,queued:0,error:null});
