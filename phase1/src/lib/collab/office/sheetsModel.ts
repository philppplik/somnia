import * as Y from 'yjs';
import {assertSafeProjectPath} from '../paths';
/**
 * Shared model for one workbook in a collab session (concept 3.2, phase 1).
 * Root key `office/<path>` on the project doc. The original .xlsx travels once through
 * the blob protocol; this model carries only the edits made while the session runs.
 * The engine stays renderer/saver on every peer; the host alone writes disk.
 *
 * Layout (schema 1):
 *   meta:  Y.Map { schema: 1, engine: 'gridcraft', baseHash: sha256 of the file the host seeded from }
 *   sheets: Y.Array<Y.Map<{id,name}>>  - order is the tab order; ids are stable across renames
 *   cells: Y.Map<'sheetId!R:C', string> - exactly what the user typed (formula or literal),
 *          never the computed value; every peer recomputes through its own engine
 *   styles: Y.Map<'sheetId!R:C', string> - serialized CellStyle patch, last writer wins (phase 1.1)
 * Structural row/column insert/delete is NOT here: it needs engine support (concept phase 3).
 */
export const SHEETS_MODEL_SCHEMA=1;
export interface SheetsSharedMeta{schema:number;engine:string;baseHash:string}
export interface SheetsModel{
 readonly doc:Y.Doc;
 readonly meta:Y.Map<unknown>;
 readonly sheets:Y.Array<Y.Map<unknown>>;
 readonly cells:Y.Map<string>;
 readonly styles:Y.Map<string>;
 /** LWW journal of formatting ops (concept 3.2): peers append, everyone applies in arrival order. */
 readonly formats:Y.Array<unknown>;
}
const root=(doc:Y.Doc,path:string)=>{assertSafeProjectPath(path);return doc.getMap<unknown>(`office/${path}`);};

/** Host-side: stamp the model for a file shared into the session. Idempotent for the same file. */
export function seedSheetsModel(doc:Y.Doc,path:string,baseHash:string):SheetsModel{
 const r=root(doc,path);
 let meta=r.get('meta') as Y.Map<unknown>|undefined;
 doc.transact(()=>{
  if(!meta){meta=new Y.Map<unknown>();r.set('meta',meta);}
  meta!.set('schema',SHEETS_MODEL_SCHEMA);meta!.set('engine','gridcraft');meta!.set('baseHash',baseHash);
  if(!r.get('sheets'))r.set('sheets',new Y.Array<Y.Map<unknown>>());
  if(!r.get('cells'))r.set('cells',new Y.Map<string>());
  if(!r.get('styles'))r.set('styles',new Y.Map<string>());
  if(!r.get('formats'))r.set('formats',new Y.Array<unknown>());
 },'sheets-model-seed');
 return openSheetsModel(doc,path);
}
export function openSheetsModel(doc:Y.Doc,path:string):SheetsModel{
 const r=root(doc,path);
 if(sheetsModelMeta({doc,meta:r.get('meta') as Y.Map<unknown>}as SheetsModel)&&!r.get('formats'))
  doc.transact(()=>{if(!r.get('formats'))r.set('formats',new Y.Array<unknown>());},'sheets-model-seed');   // models stamped before the format log existed
 return{doc,meta:r.get('meta') as Y.Map<unknown>,sheets:r.get('sheets') as Y.Array<Y.Map<unknown>>,cells:r.get('cells') as Y.Map<string>,styles:r.get('styles') as Y.Map<string>,formats:r.get('formats') as Y.Array<unknown>};
}
export function sheetsModelMeta(m:SheetsModel):SheetsSharedMeta|null{
 if(!m.meta)return null;
 const schema=m.meta.get('schema'),engine=m.meta.get('engine'),baseHash=m.meta.get('baseHash');
 if(schema!==SHEETS_MODEL_SCHEMA||engine!=='gridcraft'||typeof baseHash!=='string'||!/^[0-9a-f]{64}$/.test(baseHash))return null;
 return{schema,engine,baseHash};
}
const addr=(row:number,col:number)=>{if(!Number.isInteger(row)||!Number.isInteger(col)||row<0||col<0||row>=5000||col>=200)throw new Error(`cell out of bounds: ${row}:${col}`);return `${row}:${col}`;};
export const cellKey=(sheetId:string,row:number,col:number)=>`${sheetId}!${addr(row,col)}`;
export function parseCellKey(key:string):{sheetId:string;row:number;col:number}|null{
 const m=/^([A-Za-z0-9_-]{1,36})!(\d+):(\d+)$/.exec(key);if(!m)return null;
 const row=Number(m[2]),col=Number(m[3]);
 return row<5000&&col<200?{sheetId:m[1],row,col}:null;
}
/** One local edit: input is exactly what was typed; empty string deletes the entry (cleared cell). */
export function setSharedCell(m:SheetsModel,sheetId:string,row:number,col:number,input:string,origin:unknown):void{
 if(input.length>32_767)throw new Error('cell input too long');
 m.doc.transact(()=>{const k=cellKey(sheetId,row,col);if(input==='')m.cells.delete(k);else m.cells.set(k,input);},origin);
}
/** Host seeds the tab list from the workbook. Existing ids are kept so cell keys stay valid. */
export function syncSharedSheets(m:SheetsModel,names:string[],origin:unknown):void{
 m.doc.transact(()=>{
  const cur=m.sheets.toArray();
  for(let i=0;i<names.length;i++){
   if(i<cur.length){cur[i].set('name',names[i]);}
   else{const s=new Y.Map<unknown>();s.set('id',`${Date.now().toString(36)}-${i}-${Math.floor(Math.random()*1e9).toString(36)}`);s.set('name',names[i]);m.sheets.push([s]);}
  }
  if(cur.length>names.length)m.sheets.delete(names.length,cur.length-names.length);
 },origin);
}
export function sharedSheetList(m:SheetsModel):{id:string;name:string}[]{
 return m.sheets.toArray().map(s=>({id:String(s.get('id')),name:String(s.get('name'))}));
}
/** Current shared edits for one sheet, as engine-ready set() calls. */
export function sharedCellsFor(m:SheetsModel,sheetId:string):{row:number;col:number;input:string}[]{
 const out:{row:number;col:number;input:string}[]=[];
 m.cells.forEach((input,key)=>{const p=parseCellKey(key);if(p&&p.sheetId===sheetId)out.push({row:p.row,col:p.col,input});});
 return out;
}