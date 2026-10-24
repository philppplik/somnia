import type {Awareness} from 'y-protocols/awareness';
import {safeUser,type SafeUser} from '../awarenessSafe';
/** Concept 3.2 presence for office: the selected range of every peer, scoped to one shared file. */
export interface SheetSel{r0:number;c0:number;r1:number;c1:number}
export interface PeerSheetPresence{clientId:number;user:SafeUser;sheet:number;sel:SheetSel}
export const SEL_FIELD='officeSel';
const FILE_MAX=180,CELL_MAX=1048576,COL_MAX=16384;
const clamp=(v:unknown,max:number)=>Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<max?(v as number):null;
/** Publish my selection for `file`; pass null to clear (sheet switch, blur, session end). */
export function announceSheetSel(a:Awareness,file:string|null,sheet:number,sel:SheetSel|null):void{
 if(!file||!sel){a.setLocalStateField(SEL_FIELD,null);return;}
 a.setLocalStateField(SEL_FIELD,{file,sheet,r0:sel.r0,c0:sel.c0,r1:sel.r1,c1:sel.c1});}
/** Remote selections on `file`, sanitised: unknown shapes and out-of-range cells are dropped. */
export function peerSheetSels(a:Awareness,file:string):PeerSheetPresence[]{
 const out:PeerSheetPresence[]=[];
 a.getStates().forEach((state,id)=>{
  if(id===a.clientID)return;
  const raw=state?.[SEL_FIELD];
  if(!raw||typeof raw!=='object')return;
  const r=raw as Record<string,unknown>;
  if(r.file!==file||!Number.isSafeInteger(r.sheet))return;
  const sel:Partial<SheetSel>={r0:clamp(r.r0,CELL_MAX)??undefined,c0:clamp(r.c0,COL_MAX)??undefined,r1:clamp(r.r1,CELL_MAX)??undefined,c1:clamp(r.c1,COL_MAX)??undefined};
  if(sel.r0===undefined||sel.c0===undefined||sel.r1===undefined||sel.c1===undefined)return;
  const r0=Math.min(sel.r0,sel.r1),r1=Math.max(sel.r0,sel.r1),c0=Math.min(sel.c0,sel.c1),c1=Math.max(sel.c0,sel.c1);
  out.push({clientId:id,user:safeUser(state.user,id),sheet:r.sheet as number,sel:{r0,c0,r1,c1}});});
 return out;}
