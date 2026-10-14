import {validateDocument,type AnimationDocument,type KeyRef} from './model';
/** Private recovery journal. Stores authoritative data (never rendered frames) plus a little view state. */
export interface KeyValueStore{getItem(k:string):string|null;setItem(k:string,v:string):void;removeItem(k:string):void}
export interface ViewState{playhead:number;selectedLayer:string|null;selectedKey:{prop:string;t:number}|null;selectedKeys:KeyRef[];loop:boolean;graphChannel:0|1;graphMode:'value'|'speed';zoom:number;scroll:number;openProps:string[];graph:boolean}
export const RECOVERY_KEY='somnia.animation.recovery.v1';
export const defaultView=():ViewState=>({playhead:0,selectedLayer:null,selectedKey:null,selectedKeys:[],loop:true,graphChannel:0,graphMode:'value',zoom:1,scroll:0,openProps:[],graph:false});
export interface Journal{v:1;savedAt:number;savedRevision:number;doc:AnimationDocument;view:ViewState}
const mem=():KeyValueStore|null=>{try{return typeof localStorage!=='undefined'?localStorage:null;}catch{return null;}};
export function writeJournal(j:Omit<Journal,'v'|'savedAt'>,store:KeyValueStore|null=mem(),now=Date.now()):boolean{
 if(!store)return false;
 try{store.setItem(RECOVERY_KEY,JSON.stringify({v:1,savedAt:now,...j}));return true;}catch{return false;}
}
/** Returns a validated journal or null. A corrupt or foreign entry is ignored and left in place for the caller to decide. */
export function readJournal(store:KeyValueStore|null=mem()):Journal|null{
 if(!store)return null;
 try{
  const raw=store.getItem(RECOVERY_KEY);if(!raw)return null;
  const j=JSON.parse(raw) as Journal;
  if(!j||j.v!==1||validateDocument(j.doc).length)return null;
  const v={...defaultView(),...(j.view??{})};
  if(!Number.isFinite(v.playhead))v.playhead=0;
  if(!Array.isArray(v.selectedKeys))v.selectedKeys=[];
  v.graphMode=v.graphMode==='speed'?'speed':'value';
  v.loop=v.loop!==false;v.graphChannel=v.graphChannel===1?1:0;
  return {...j,view:v};
 }catch{return null;}
}
export const clearJournal=(store:KeyValueStore|null=mem())=>{try{store?.removeItem(RECOVERY_KEY);}catch{/* storage unavailable */}};
