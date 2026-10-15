import {useSyncExternalStore} from 'react';
import type {Command} from './commandRegistry';

/**
 * Advanced export center: one grouped dialog over every studio's existing export commands.
 * The center owns no export logic itself; it only groups registered commands and runs them.
 */

let open=false;
const subs=new Set<()=>void>();
const emit=()=>subs.forEach(f=>f());
export const exportCenterOpen=()=>open;
export function setExportCenterOpen(v:boolean){if(open===v)return;open=v;emit();}
export const useExportCenterOpen=()=>useSyncExternalStore(cb=>{subs.add(cb);return()=>{subs.delete(cb);};},exportCenterOpen,exportCenterOpen);

/** Group order is dialog order; command order inside a group is dialog order. */
export const EXPORT_GROUP_IDS:Readonly<Record<string,readonly string[]>>={
 project:['project.export','project.export.md'],
 documents:['documents.export.advanced','documents.export.open','documents.saveCopy','documents.export.pdf','documents.export.copy'],
 sheets:['sheets.export.advanced','sheets.saveCopy'],
 slides:['slides.export.advanced','slides.saveCopy'],
 design:['design.export.open','design.exportSvg','design.exportAllSvg','design.exportProject'],
 photos:['photos.export.open','photos.export.png','photos.export.jpeg','photos.export.advanced'],
 vector:['vector.export.open','vector.exportSvg','vector.exportPng'],
 sound:['sound.export.open','sound.export'],
 video:['video.export.open','video.export.start'],
 pdf:['pdf.saveCopy'],
 '3d':['studio3d.export.glb','studio3d.export.gltf','studio3d.render.turntable','studio3d.render.still'],
 animation:['animation.export.frame','animation.export.sequence'],
};

/** A preset bundles existing export commands with fixed payloads (format/quality choices). It adds no new command. */
export interface ExportPreset{id:string;steps:readonly (readonly [string,unknown?])[]}
export const EXPORT_PRESETS:Readonly<Record<string,readonly ExportPreset[]>>={
 documents:[
  {id:'docxCopy',steps:[['documents.export.copy']]},
  {id:'pdfMarkup',steps:[['documents.export.pdf',{markup:true,tagged:true}]]},
  {id:'pdfClean',steps:[['documents.export.pdf',{markup:false,tagged:true}]]},
 ],
 vector:[
  {id:'png1x',steps:[['vector.exportPng',{scale:1}]]},
  {id:'png2x',steps:[['vector.exportPng',{scale:2}]]},
  {id:'png4x',steps:[['vector.exportPng',{scale:4}]]},
 ],
 video:[
  {id:'webm',steps:[['video.export.format',{format:'webm'}],['video.export.start']]},
  {id:'mp4',steps:[['video.export.format',{format:'mp4'}],['video.export.start']]},
 ],
};

/** One dialog row: a plain registered command or a preset. Rows carry their own enabled state. */
export type ExportRow=
 |{kind:'command';command:Command;enabled:boolean}
 |{kind:'preset';preset:ExportPreset;enabled:boolean};
export interface ExportGroup{studio:string;rows:ExportRow[]}

const presetEnabled=(p:ExportPreset,byId:ReadonlyMap<string,Command>,enabled:(c:Command)=>boolean)=>p.steps.every(([id])=>enabled(byId.get(id)!));
const presetRegistered=(p:ExportPreset,byId:ReadonlyMap<string,Command>)=>p.steps.every(([id])=>byId.has(id));

/** Groups the currently registered commands; studios whose commands are not registered (studio not mounted) drop out. A preset appears only when every step's command is registered. Studio groups list presets before plain commands. */
export function exportGroups(all:readonly Command[],enabled:(c:Command)=>boolean=(c)=>c.enabled?.()??true):ExportGroup[]{
 const byId=new Map(all.map(c=>[c.id,c]));
 return Object.entries(EXPORT_GROUP_IDS)
  .map(([studio,ids]):ExportGroup=>{
   const rows:ExportRow[]=[
    ...(EXPORT_PRESETS[studio]??[]).filter(p=>presetRegistered(p,byId)).map((p):ExportRow=>({kind:'preset',preset:p,enabled:presetEnabled(p,byId,enabled)})),
    ...ids.map(id=>byId.get(id)).filter((c):c is Command=>!!c).map((c):ExportRow=>({kind:'command',command:c,enabled:enabled(c)})),
   ];
   return {studio,rows};
  })
  .filter(g=>g.rows.length>0);
}

/** Runs a preset's steps in order through the caller's executor (executeCommand in the dialog, a spy in tests). */
export async function runPreset(preset:ExportPreset,exec:(id:string,payload?:unknown)=>void|Promise<void>):Promise<void>{for(const [id,payload] of preset.steps)await exec(id,payload);}

/* Recently used exports, persisted locally. Cap keeps the group small; unresolvable entries drop out silently. */
export type RecentKind='command'|'preset';
export interface RecentEntry{kind:RecentKind;id:string}
const RECENT_KEY='somnia.exportCenter.recent.v1';
export const MAX_RECENT=5;
let recRev=0;
export const recentRevision=()=>recRev;
export const useRecentRevision=()=>useSyncExternalStore(cb=>{subs.add(cb);return()=>{subs.delete(cb);};},recentRevision,recentRevision);
const storage=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
export function readRecents():RecentEntry[]{
 const s=storage();if(!s)return [];
 try{const v=JSON.parse(s.getItem(RECENT_KEY)||'[]');
  return Array.isArray(v)?v.filter(e=>e&&(e.kind==='command'||e.kind==='preset')&&typeof e.id==='string').slice(0,MAX_RECENT):[];}catch{return [];}
}
export function recordRecent(kind:RecentKind,id:string){
 const s=storage();if(!s)return;
 const next=[{kind,id},...readRecents().filter(e=>!(e.kind===kind&&e.id===id))].slice(0,MAX_RECENT);
 try{s.setItem(RECENT_KEY,JSON.stringify(next));}catch{/* storage full or blocked */}
 recRev++;emit();
}
/** The 'recent' group in stored (most-recent-first) order; entries whose command/preset is not currently registered drop out. */
export function recentGroup(all:readonly Command[],enabled:(c:Command)=>boolean=(c)=>c.enabled?.()??true):ExportGroup|null{
 const byId=new Map(all.map(c=>[c.id,c]));
 const presetById=new Map(Object.values(EXPORT_PRESETS).flat().map(p=>[p.id,p]));
 const rows:ExportRow[]=[];
 for(const e of readRecents()){
  if(e.kind==='command'){const c=byId.get(e.id);if(c)rows.push({kind:'command',command:c,enabled:enabled(c)});}
  else{const p=presetById.get(e.id);if(p&&presetRegistered(p,byId))rows.push({kind:'preset',preset:p,enabled:presetEnabled(p,byId,enabled)});}
 }
 return rows.length>0?{studio:'recent',rows}:null;
}

export const rowLabel=(row:ExportRow,presetLabel:(id:string)=>string)=>row.kind==='command'?row.command.title:presetLabel(row.preset.id);
const rowId=(row:ExportRow)=>row.kind==='command'?row.command.id:row.preset.id;

/** Filters groups by a case-insensitive substring over row label and id. Empty query returns the input unchanged; groups with no surviving rows drop out. */
export function filterExportGroups(groups:readonly ExportGroup[],query:string,presetLabel:(id:string)=>string):ExportGroup[]{
 const q=query.trim().toLowerCase();if(!q)return groups.slice();
 return groups
  .map(g=>({...g,rows:g.rows.filter(r=>rowLabel(r,presetLabel).toLowerCase().includes(q)||rowId(r).toLowerCase().includes(q))}))
  .filter(g=>g.rows.length>0);
}
