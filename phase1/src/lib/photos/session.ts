import {neutralDevelop,validateDevelop,type DevelopSettings} from './registry';
/** Settings state only. No pixels, network, engine, disk or implicit AI acceptance. */
export interface DevelopMetadata {name:string;mime:string;width:number;height:number}
export interface DevelopSession {readonly identity:string;now:DevelopSettings;past:DevelopSettings[];future:DevelopSettings[];saved:string;revision:number;metadata:DevelopMetadata|null;ready:boolean}
const sessions=new Map<string,DevelopSession>();const listeners=new Set<()=>void>();let revision=0;
export const developSignature=(s:DevelopSettings)=>JSON.stringify({exposure:s.exposure,contrast:s.contrast,saturation:s.saturation});
const emit=()=>{revision++;listeners.forEach(f=>f());};
export const subscribeDevelop=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export const developRevision=()=>revision;
export function getDevelopSession(identity:string){return sessions.get(identity)??null;}
export function ensureDevelopSession(identity:string){if(!identity)throw Error('Missing photo source identity.');let s=sessions.get(identity);if(!s){s={identity,now:{...neutralDevelop},past:[],future:[],saved:developSignature(neutralDevelop),revision:0,metadata:null,ready:false};sessions.set(identity,s);}return s;}
export function allDevelopSessions(){return [...sessions.values()];}
export function configureDevelopSession(identity:string,metadata:DevelopMetadata,ready:boolean){const s=ensureDevelopSession(identity);if(Object.keys(metadata).sort().join(',')!=='height,mime,name,width'||!metadata.name||!['image/jpeg','image/png'].includes(metadata.mime)||!Number.isSafeInteger(metadata.width)||!Number.isSafeInteger(metadata.height)||metadata.width<1||metadata.height<1||metadata.width*metadata.height>16_777_216)throw Error('Invalid Develop metadata.');s.metadata={...metadata};s.ready=ready;emit();}
export function setDevelopReady(identity:string,ready:boolean){const s=getDevelopSession(identity);if(s&&s.ready!==ready){s.ready=ready;emit();}}
export function updateDevelopSettings(identity:string,next:DevelopSettings){validateDevelop(next);const s=ensureDevelopSession(identity);if(developSignature(s.now)===developSignature(next))return;s.past=[...s.past.slice(-49),{...s.now}];s.now={...next};s.future=[];s.revision++;emit();}
export function historyDevelop(identity:string,redo:boolean){const s=ensureDevelopSession(identity);const from=redo?s.future:s.past,to=redo?s.past:s.future;const next=from.pop();if(next){to.push({...s.now});s.now={...next};s.revision++;emit();}}
export function markDevelopSaved(identity:string,snapshot:DevelopSettings){const s=getDevelopSession(identity);if(s){s.saved=developSignature(snapshot);emit();}}
export function forgetDevelopSession(identity:string){if(sessions.delete(identity))emit();}
export function dirtyDevelop(s:DevelopSession){return developSignature(s.now)!==s.saved;}
