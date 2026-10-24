import type {StatusSlotDef} from './types';
import {evalWhen} from './when';
/**
 * Status bar slots (concept 4.7, package M4). Pure: no React, no app state.
 * The shell owns the frame and the global items (update pill, notices, version, revision). A studio declares
 * `StatusSlotDef[]`; the frame decides where known slot ids sit so the Code status bar stays identical.
 * Unknown slot ids (new studio slots) are placed by `align`: left after the known left slots, center inside the
 * context region, right after the viewport slot.
 */
export type StatusItem=
 |{kind:'global';id:string}
 |{kind:'slot';id:string;def:StatusSlotDef};
/** Fixed frame order. 'g:' entries are shell-owned, 's:' entries are the positions of known slot ids. */
export const STATUS_FRAME:readonly string[]=['g:drag-hint','s:save','g:notices','s:problems','g:update','g:collab','g:math','g:message','@center','s:view-mode','g:version','g:revision','s:viewport','@right'];
/** Known slot ids and where they sit. Anything else is an extra. */
const KNOWN_CENTER=['selection','line-col','words','file'];
const KNOWN_FRAME=new Set(STATUS_FRAME.filter(e=>e.startsWith('s:')).map(e=>e.slice(2)));
/** `before` renders left of the context region, `center` inside it (it grows), `after` to its right. */
export interface StatusLayout{before:readonly StatusItem[];center:readonly StatusItem[];after:readonly StatusItem[]}
/** Slots whose `when` is false are dropped. A slot id declared twice keeps the first. */
export function visibleSlots(defs:readonly StatusSlotDef[],ctx:unknown):StatusSlotDef[]{
 const seen=new Set<string>();
 return defs.filter(d=>{if(seen.has(d.id))return false;seen.add(d.id);return evalWhen(d.when,ctx);});
}
export function layoutStatusBar(defs:readonly StatusSlotDef[],ctx:unknown):StatusLayout{
 const vis=visibleSlots(defs,ctx),by=new Map(vis.map(d=>[d.id,d]));
 const slot=(d:StatusSlotDef):StatusItem=>({kind:'slot',id:d.id,def:d});
 const extras=(align:StatusSlotDef['align'])=>vis.filter(d=>d.align===align&&!KNOWN_FRAME.has(d.id)&&!KNOWN_CENTER.includes(d.id)).map(slot);
 const before:StatusItem[]=[],after:StatusItem[]=[];let items=before;
 for(const e of STATUS_FRAME){
  if(e==='@center'){items=after;continue;}
  if(e==='@right'){items.push(...extras('right'));continue;}
  const id=e.slice(2);
  if(e.startsWith('g:'))items.push({kind:'global',id});
  else{const d=by.get(id);if(d)items.push(slot(d));}
  if(id==='problems')items.push(...extras('left'));
 }
 const center:StatusItem[]=[...KNOWN_CENTER.flatMap(id=>by.has(id)?[slot(by.get(id)!)]:[]),...extras('center')];
 return {before,center,after};
}
/** Per-studio declarations. A studio without a declaration uses the default set, so nothing changes until it migrates. */
export const DEFAULT_STATUS_SLOTS:readonly StatusSlotDef[]=Object.freeze([
 {id:'save',align:'left',component:'status.save'},
 {id:'problems',align:'left',component:'status.problems',command:'problems.toggle'},
 {id:'selection',align:'center',component:'status.selection',when:"domain=='web'"},
 {id:'line-col',align:'center',component:'status.lineCol',when:"surface!='canvas'"},
 {id:'words',align:'center',component:'status.words',when:"domain=='markdown'"},
 {id:'file',align:'center',component:'status.file',when:"domain=='raster'||domain=='vector'||domain=='pdf'||domain=='code-only'||domain=='media-readonly'"},
 {id:'view-mode',align:'right',component:'status.viewMode',when:"!media.active&&studio!='slides'&&studio!='vector'"},
 {id:'viewport',align:'right',component:'status.viewport'},
]);
/** Code declares today's slots: Problems, Ln/Col (and the rest of the shared context region), viewport. */
export const CODE_STATUS_SLOTS:readonly StatusSlotDef[]=DEFAULT_STATUS_SLOTS;
const declared=new Map<string,readonly StatusSlotDef[]>([['code',CODE_STATUS_SLOTS]]);
export const registerStatusSlots=(studio:string,defs:readonly StatusSlotDef[])=>{declared.set(studio,defs);return()=>{if(declared.get(studio)===defs)declared.delete(studio);};};
export const statusSlotsFor=(studio:string):readonly StatusSlotDef[]=>declared.get(studio)??DEFAULT_STATUS_SLOTS;
