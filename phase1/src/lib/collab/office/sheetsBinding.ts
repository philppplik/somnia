import {openSheetsModel,parseCellKey,setSharedCell,type SheetsModel} from './sheetsModel';
import {UndoManager} from 'yjs';
import {addressOf} from '../../sheets/format';
import {parseFormatOp} from '../../sheets/formatOps';
import type {FormatOp} from '../../sheets/protocol';
/** The slice of the spreadsheet engine the binding drives. The real SheetsEngine satisfies it; tests inject a fake. */
export interface SheetsEnginePort{set(sheet:number,address:string,input:string):Promise<unknown>;format?(sheet:number,row:number,col:number,rows:number,cols:number,op:FormatOp):Promise<unknown>;setValues?(sheet:number,row:number,col:number,values:string[][]):Promise<unknown>;clear?(sheet:number,row:number,col:number,rows:number,cols:number):Promise<unknown>}
/** One journal entry: a rect format op on a shared sheet. Bounded, sanitised before any engine call. */
export interface SharedFormatEntry{sheetId:string;r0:number;c0:number;r1:number;c1:number;op:FormatOp}
const FORMAT_LOG_MAX=2000,MAX_FORMAT_PER_INSERT=64;
const RECT_MAX_ROWS=5000,RECT_MAX_COLS=200;
export function cleanFormatEntry(raw:unknown):SharedFormatEntry|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const e=raw as Record<string,unknown>;
 if(typeof e.sheetId!=='string'||e.sheetId.length>64)return null;
 for(const k of['r0','c0','r1','c1'])if(!Number.isSafeInteger(e[k]))return null;
 const r0=e.r0 as number,c0=e.c0 as number,r1=e.r1 as number,c1=e.c1 as number;
 if(r0<0||c0<0||r1<r0||c1<c0||r1-r0>=RECT_MAX_ROWS||c1-c0>=RECT_MAX_COLS)return null;
 try{return{sheetId:e.sheetId,r0,c0,r1,c1,op:parseFormatOp(e.op)};}catch{return null;}}
export interface SheetsBindingDeps{
 engine:SheetsEnginePort;
 /** shared sheet id -> live engine index; null while the tab list is not seeded yet. */
 sheetIndexOf(sheetId:string):number|null;
}
/**
 * Binds one workbook's shared model to a live engine (concept 3.2):
 * local edit -> engine op, then shared op. Remote shared op -> engine op (idempotent).
 * The binding's own transactions carry its origin, so the observer never applies its own writes back.
 */
export class SheetsCollabBinding{
 readonly origin={binding:'sheets'};   // transaction marker: anything else is remote
 private model:SheetsModel;
 private off:()=>void;
 /** Per-person undo: tracks only this binding's transactions; its own undo transactions flow back to the engine through the remote path. */
 readonly um:UndoManager;
 private queue:Promise<void>=Promise.resolve();   // engine ops run one at a time, in arrival order
 constructor(doc:import('yjs').Doc,path:string,private d:SheetsBindingDeps){
  this.model=openSheetsModel(doc,path);
  const onCells=(ev:import('yjs').YMapEvent<string>,tx:import('yjs').Transaction)=>{
   if(tx.origin===this.origin)return;
   const jobs:{sheetId:string;row:number;col:number;input:string}[]=[];
   ev.changes.keys.forEach((change,key)=>{
    const p=parseCellKey(key);if(!p)return;
    jobs.push({...p,input:change.action==='delete'?'':(this.model.cells.get(key)??'')});});
   if(jobs.length)this.enqueue(jobs);};
  const onFormats=(ev:import('yjs').YArrayEvent<unknown>,tx:import('yjs').Transaction)=>{
   if(tx.origin===this.origin)return;
   const entries:SharedFormatEntry[]=[];
   ev.changes.delta.forEach(part=>{if(part.insert)for(const raw of (part.insert as unknown[]).slice(0,MAX_FORMAT_PER_INSERT)){const e=cleanFormatEntry(raw);if(e)entries.push(e);}});
   if(entries.length)this.enqueueFormats(entries);};
  this.model.cells.observe(onCells);
  this.model.formats.observe(onFormats);
  this.off=()=>{this.model.cells.unobserve(onCells);this.model.formats.unobserve(onFormats);};
  this.um=new UndoManager(this.model.cells,{trackedOrigins:new Set([this.origin]),captureTimeout:0});
 }
 private enqueue(jobs:{sheetId:string;row:number;col:number;input:string}[]){
  this.queue=this.queue.then(async()=>{
   for(const j of jobs){
    const sheet=this.d.sheetIndexOf(j.sheetId);if(sheet===null)continue;   // tab list not seeded yet: the seed replay covers it
    try{await this.d.engine.set(sheet,addressOf(j.row,j.col),j.input);}catch{/* a refused remote edit stays in the model; the engine is the renderer, not the truth */}}});}
 /** Local edit: engine first (it validates), then the shared write. */
 async applyLocalEdit(sheetId:string,row:number,col:number,input:string):Promise<void>{
  const sheet=this.d.sheetIndexOf(sheetId);if(sheet===null)throw new Error('unknown sheet');
  await this.d.engine.set(sheet,addressOf(row,col),input);
  setSharedCell(this.model,sheetId,row,col,input,this.origin);}
 /** Local paste block: one engine write, one shared transaction. */
 async applyLocalBlock(sheetId:string,row:number,col:number,values:string[][]):Promise<void>{
  const sheet=this.d.sheetIndexOf(sheetId);if(sheet===null)throw new Error('unknown sheet');
  if(this.d.engine.setValues)await this.d.engine.setValues(sheet,row,col,values);
  else for(let i=0;i<values.length;i++)for(let j=0;j<values[i].length;j++)await this.d.engine.set(sheet,addressOf(row+i,col+j),values[i][j]);
  this.model.doc.transact(()=>{for(let i=0;i<values.length;i++)for(let j=0;j<values[i].length;j++)setSharedCell(this.model,sheetId,row+i,col+j,values[i][j],this.origin);},this.origin);}
 /** Local clear of a rect: engine clear (formats stay), shared deletions in one transaction. */
 async applyLocalClear(sheetId:string,r0:number,c0:number,r1:number,c1:number):Promise<void>{
  const sheet=this.d.sheetIndexOf(sheetId);if(sheet===null)throw new Error('unknown sheet');
  if(this.d.engine.clear)await this.d.engine.clear(sheet,r0,c0,r1-r0+1,c1-c0+1);
  else for(let i=r0;i<=r1;i++)for(let j=c0;j<=c1;j++)await this.d.engine.set(sheet,addressOf(i,j),'');
  this.model.doc.transact(()=>{for(let i=r0;i<=r1;i++)for(let j=c0;j<=c1;j++)setSharedCell(this.model,sheetId,i,j,'',this.origin);},this.origin);}
 private enqueueFormats(entries:SharedFormatEntry[]){
  this.queue=this.queue.then(async()=>{
   for(const e of entries){
    const sheet=this.d.sheetIndexOf(e.sheetId);if(sheet===null)continue;
    try{await this.d.engine.format?.(sheet,e.r0,e.c0,e.r1-e.r0+1,e.c1-e.c0+1,e.op);}catch{/* engine refused; the journal stays the truth */}}});}
 /** Local format op: engine first (it validates), then one journal entry; the log is capped oldest-first. */
 async applyLocalFormat(sheetId:string,r0:number,c0:number,r1:number,c1:number,op:FormatOp):Promise<void>{
  const sheet=this.d.sheetIndexOf(sheetId);if(sheet===null)throw new Error('unknown sheet');
  if(!this.d.engine.format)throw new Error('engine has no format op');
  await this.d.engine.format(sheet,r0,c0,r1-r0+1,c1-c0+1,op);
  this.model.doc.transact(()=>{
   this.model.formats.push([{sheetId,r0,c0,r1,c1,op}]);
   const over=this.model.formats.length-FORMAT_LOG_MAX;
   if(over>0)this.model.formats.delete(0,over);
  },this.origin);}
 /** Undo/redo of MY edits only (peers keep theirs); the observer re-applies the result to the engine. */
 undo(){this.um.undo();}
 redo(){this.um.redo();}
 get canUndo(){return this.um.undoStack.length>0;}
 get canRedo(){return this.um.redoStack.length>0;}
 /** Re-apply every shared cell of one sheet to the engine (after open or after a late seed). */
 replay(sheetId:string){
  const jobs:{sheetId:string;row:number;col:number;input:string}[]=[];
  this.model.cells.forEach((input,key)=>{const p=parseCellKey(key);if(p&&p.sheetId===sheetId)jobs.push({...p,input});});
  if(jobs.length)this.enqueue(jobs);
  const entries:SharedFormatEntry[]=[];
  this.model.formats.forEach(raw=>{const e=cleanFormatEntry(raw);if(e&&e.sheetId===sheetId)entries.push(e);});
  if(entries.length)this.enqueueFormats(entries);}
 destroy(){this.um.destroy();this.off();}
}
