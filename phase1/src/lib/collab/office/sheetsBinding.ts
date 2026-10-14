import {openSheetsModel,parseCellKey,setSharedCell,type SheetsModel} from './sheetsModel';
import {addressOf} from '../../sheets/format';
/** The slice of the spreadsheet engine the binding drives. The real SheetsEngine satisfies it; tests inject a fake. */
export interface SheetsEnginePort{set(sheet:number,address:string,input:string):Promise<unknown>;setValues?(sheet:number,row:number,col:number,values:string[][]):Promise<unknown>;clear?(sheet:number,row:number,col:number,rows:number,cols:number):Promise<unknown>}
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
  this.model.cells.observe(onCells);
  this.off=()=>this.model.cells.unobserve(onCells);
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
 /** Re-apply every shared cell of one sheet to the engine (after open or after a late seed). */
 replay(sheetId:string){
  const jobs:{sheetId:string;row:number;col:number;input:string}[]=[];
  this.model.cells.forEach((input,key)=>{const p=parseCellKey(key);if(p&&p.sheetId===sheetId)jobs.push({...p,input});});
  if(jobs.length)this.enqueue(jobs);}
 destroy(){this.off();}
}
