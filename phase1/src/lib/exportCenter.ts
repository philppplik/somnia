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
 documents:['documents.export.open','documents.saveCopy','documents.export.pdf','documents.export.copy'],
 sheets:['sheets.saveCopy'],
 slides:['slides.saveCopy'],
 design:['design.export.open','design.exportSvg','design.exportAllSvg','design.exportProject'],
 photos:['photos.export.open','photos.export.png','photos.export.jpeg','photos.export.advanced'],
 vector:['vector.export.open','vector.exportSvg','vector.exportPng'],
 sound:['sound.export.open','sound.export'],
 video:['video.export.open','video.export.start'],
 pdf:['pdf.saveCopy'],
};

export interface ExportGroup{studio:string;commands:Command[]}
/** Groups the currently registered commands; studios whose commands are not registered (studio not mounted) drop out. */
export function exportGroups(all:readonly Command[]):ExportGroup[]{
 const byId=new Map(all.map(c=>[c.id,c]));
 return Object.entries(EXPORT_GROUP_IDS)
  .map(([studio,ids])=>({studio,commands:ids.map(id=>byId.get(id)).filter((c):c is Command=>!!c)}))
  .filter(g=>g.commands.length>0);
}
