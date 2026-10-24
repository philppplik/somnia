import {effectiveRail,railEdits,sanitizeOverrides,EMPTY_RAIL_OVERRIDES} from '../lib/shell/railResolver';
import {studioPanels,studioDefaultLayout,studioRail} from '../lib/shell/codePanels';
import {getStudioContext} from '../lib/shell/studioContext';
import type {RailItemDef,RailOverrides} from '../lib/shell/types';
import type {StudioDef} from '../lib/studios/registry';
import {shellLayoutStore} from './shellLayoutStore';
/**
 * Rail customization (concept 4.3a). The rail of a studio that owns `shellV2.panels` is user-editable:
 * reorder, pin, move to the overflow menu, hide, reset. One overrides record per studio covers both sides
 * (ids are unique within a studio); every edit is sided so it never disturbs the other rail.
 */
export type RailSide='left'|'right';
export type RailOp='pin'|'unpin'|'hide'|'show'|'moveUp'|'moveDown'|'move'|'reset';
/** `to` is the destination index among the visible icons (op 'move', used by drag and drop). */
export interface RailTarget{side:RailSide;id:string;to?:number}
export const railCustomizable=(studio:StudioDef)=>!!studio.shellV2?.panels?.length;
let focused:RailTarget|null=null;
/** The rail item last focused or right-clicked. Payload-less rail commands (palette, shortcuts) act on it. */
export const setFocusedRailItem=(t:RailTarget|null)=>{focused=t;};
export const getFocusedRailItem=()=>focused;
const sideIds=(studio:StudioDef,side:RailSide)=>studioRail(studio,side).map(i=>i.id);
export function railModel(studio:StudioDef,side:RailSide,overrides:Partial<RailOverrides>|undefined,ctx:unknown){
 const base=studioRail(studio,side),eff=effectiveRail(base,overrides,{ctx}),ov=sanitizeOverrides(overrides,base);
 const hidden=base.filter(i=>ov.hidden.includes(i.id));
 return {...eff,hidden,overrides:ov};
}
/** Pure edit. Returns the next overrides for the whole studio, or null when the op does not apply. */
export function editRailOverrides(studio:StudioDef,all:Partial<RailOverrides>|undefined,op:RailOp,target:RailTarget,ctx:unknown):RailOverrides|null{
 const base=[...studioRail(studio,'left'),...studioRail(studio,'right')];
 const cur=sanitizeOverrides(all,base);
 if(op==='reset')return {...EMPTY_RAIL_OVERRIDES,order:[],pinned:[],hidden:[],unpinned:[]};
 if(!sideIds(studio,target.side).includes(target.id))return null;
 switch(op){
  case 'pin':return railEdits.pin(cur,target.id);
  case 'unpin':return railEdits.unpin(cur,target.id);
  case 'hide':return railEdits.hide(cur,target.id);
  case 'show':return railEdits.show(cur,target.id);
  case 'moveUp':case 'moveDown':case 'move':{
   const m=railModel(studio,target.side,cur,ctx),vis=m.visible.map(i=>i.id),at=vis.indexOf(target.id);
   const to=op==='move'?(target.to??-1):op==='moveUp'?at-1:at+1;
   if(at<0||to<0||to>=vis.length||to===at)return null;
   const sideOrder=[...vis.filter(x=>x!==target.id)];sideOrder.splice(to,0,target.id);
   const mine=new Set(sideIds(studio,target.side));
   return {...cur,order:[...cur.order.filter(x=>!mine.has(x)),...sideOrder,...m.overflow.map(i=>i.id)]};
  }
 }
}
export function applyRailOp(studio:StudioDef,op:RailOp,target:RailTarget):boolean{
 if(!railCustomizable(studio))return false;
 const panels=studioPanels(studio),defaults=studioDefaultLayout(studio);
 const layout=shellLayoutStore.get(studio.id,defaults,panels);
 const next=editRailOverrides(studio,layout.railOverrides,op,target,{...getStudioContext(),studio:studio.id});
 if(!next)return false;
 shellLayoutStore.update(studio.id,{railOverrides:next},defaults,panels);
 return true;
}
export type {RailItemDef};
