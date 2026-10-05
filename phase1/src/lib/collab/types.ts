/** Share/Join UI contract. The UI only talks to a CollabEngine; the real Yjs relay plugs in later (see docs/collab-share-ui.md). */
export type GuestRole='editor'|'viewer';
export type HostState='off'|'starting'|'live'|'error';
export type GuestState='idle'|'connecting'|'connected'|'reconnecting'|'error';
export type JoinFailure='bad-link'|'refused'|'expired'|'blocked'|'unreachable'|'full';
export interface Invite{role:GuestRole;link:string;expiresAt:number}
export interface Participant{id:string;name:string;role:GuestRole|'host';online:boolean}
export interface CollabError{kind:JoinFailure|'start-failed';message:string}
export interface CollabSnapshot{
 host:{state:HostState;invites:Invite[];participants:Participant[];lan:boolean;error:CollabError|null};
 guest:{state:GuestState;role:GuestRole|null;hostName:string|null;error:CollabError|null};
}
export interface CollabEngine{
 /** Start hosting the open project. lan=false binds to this machine only. */
 startHosting(opts:{lan:boolean;ttlMs:number}):Promise<void>;
 stopHosting():Promise<void>;
 /** Make a fresh invite for a role. The old code for that role stops working. */
 renewInvite(role:GuestRole,ttlMs:number):Promise<void>;
 join(link:string,displayName:string):Promise<void>;
 leave():Promise<void>;
 subscribe(listener:()=>void):()=>void;
 snapshot():CollabSnapshot;
}
