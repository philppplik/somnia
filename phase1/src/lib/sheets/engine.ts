import {isMutatingOp} from './engineOps';
import {parseSpecialResult,type SpecialKind,type SpecialResult} from './specialOps';
import {parsePageList,type PageList} from './pageBreaks';
import {parseCellInfo,type CellInfo} from './cellInfo';
import {parseReviewResult,type ReviewResult} from './reviewInfo';
import {parseAuditAnswer,type AuditAnswer,type AuditBridgeOp} from './audit';
import {parseAnnotations,parseNoteList,type NoteList} from './notes';
import {parseNames} from './names';
import {parsePivotFields,parseTables} from './tableOps';
import {parseScenarios} from './whatIfOps';
import {parseSavedViews} from './savedViews';
import {parseFunctionCatalog,parseCustomStyles} from './cellToolOps';
import {parsePivotReports} from './pivotEditOps';
import {parseCfRules} from './cfManageOps';
import {parseValidationRules} from './validationOps';
import type {ValidationListItem,ValidationManageOp} from './protocol';
import {parseInvalidCells,parseValidationRule} from './validationOps';
import {parseOutlineInfo} from './outlineOps';
import {parseObjects,pictureDataUrl} from './objectOps';
import {parseCharts,parseScene,parseSparklines} from './chartOps';
import {parseExportResult,parsePageInfo} from './printOps';
import type {InvalidCells,ValidationRuleInfo,CfManageOp,CfRuleInfo,ChartInfo,ChartOp,ChartScene,SparklineOp,SparklineScene,ProtectOp,WhatIfOp,LayoutOp,CellToolOp,DataToolOp,PivotEditOp,PivotReport,FunctionInfo,OutlineInfo,OutlineOp,SavedView,SavedViewOp,ObjectOp,ObjectsInfo,ScenarioInfo,ViewOp,ViewOpResult,PageInfo,PageSetupOp,ExportOp,ExportResult,PivotField,PivotFunc,TableOp,TablesInfo,NameInfo,NameOp,AnnotateOp,CellAnnotations,DedupeOp,SplitOp,ReplaceOp,ValidationOp,CfOp,FillDirection,SheetsEditReceipt,SheetsRangeReceipt,SheetsNativeState,FilterOp,SortOp,SheetOp,FormatOp,LineAxis,LineOp,RangeResult,SheetInfo,SheetLayout,SheetsRequest,SheetsResponse,ViewResult,WorkbookInfo,PasteOp} from './protocol';
import {MAX_INPUT_BYTES} from './protocol';
import {parseEditReceipt,parseNativeState,parseRangeReceipt} from './receipt';
type Req=SheetsRequest extends infer R?R extends {id:number}?Omit<R,'id'>:never:never;
/** One module Worker per open workbook. A timeout or crash discards the session: callers must keep the original bytes. */
export class SheetsEngine{
 private worker:Worker;private nextId=1;private disposed=false;
 private mutationListeners=new Set<()=>void>();
 subscribeSelectionRead(f:()=>void){this.mutationListeners.add(f);return()=>{this.mutationListeners.delete(f);};}
 private notifySelectionRead(){this.mutationListeners.forEach(f=>{try{f();}catch{/* Observers cannot block worker requests or invalidate their receipt. */}});}
 private mutationEpoch=0;private mutations=0;
 get selectionReadEpoch(){return this.mutationEpoch;}
 get hasPendingMutation(){return this.mutations>0;}
 private pending=new Map<number,{resolve:(r:SheetsResponse)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 readonly timeoutMs:number;
 constructor(timeoutMs=30_000){
  this.timeoutMs=timeoutMs;
  this.worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
  this.worker.onmessage=({data}:MessageEvent<SheetsResponse>)=>{const p=this.pending.get(data.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(data.id);if(data.ok)p.resolve(data);else p.reject(new Error(data.error));};
  this.worker.onerror=e=>this.dispose(new Error(e.message||'Spreadsheet engine failed'));
  this.worker.onmessageerror=()=>this.dispose(new Error('Spreadsheet engine response could not be decoded'));
 }
 get isDisposed(){return this.disposed;}
 private request(message:Req,transfer:Transferable[]=[]){
  return new Promise<SheetsResponse>((resolve,reject)=>{
   if(this.disposed){reject(new Error('Spreadsheet engine closed'));return;}
   const mutating=isMutatingOp(message.op);if(mutating){this.mutationEpoch++;this.mutations++;this.notifySelectionRead();}const finish=()=>{if(mutating){this.mutations--;this.mutationEpoch++;this.notifySelectionRead();}};const done=(r:SheetsResponse)=>{finish();resolve(r);},failed=(e:Error)=>{finish();reject(e);};
   const id=this.nextId++;
   const timer=setTimeout(()=>this.dispose(new Error('Spreadsheet engine timed out. Unsaved edits in this workbook were discarded.')),this.timeoutMs);
   this.pending.set(id,{resolve:done,reject:failed,timer});
   try{this.worker.postMessage({...message,id},transfer);}catch(e){clearTimeout(timer);this.pending.delete(id);failed(e instanceof Error?e:new Error(String(e)));}
  });}
 private async result<T>(message:Req):Promise<T>{const r=await this.request(message);if(r.ok&&r.op==='result')return r.result as T;throw new Error('Unexpected engine response');}
 init(){return this.request({op:'init',wasmUrl:new URL('../../../sheets-craft/pkg/somnia_sheets_craft_bg.wasm',import.meta.url).href});}
 /** Copies the bytes: the caller keeps the original for recovery. */
 async open(bytes:Uint8Array):Promise<WorkbookInfo>{
  if(bytes.byteLength>MAX_INPUT_BYTES)throw new Error('Workbook is larger than the 32 MB limit.');
  const copy=bytes.slice().buffer;await this.init();
  return this.result<WorkbookInfo>({op:'open',bytes:copy} as Req) as Promise<WorkbookInfo>;}
 info(sheet:number){return this.result<SheetInfo>({op:'info',sheet});}
 range(sheet:number,row:number,col:number,rows:number,cols:number){return this.result<RangeResult>({op:'range',sheet,row,col,rows,cols});}
 view(sheet:number,row:number,col:number,rows:number,cols:number){return this.result<ViewResult>({op:'view',sheet,row,col,rows,cols});}
 layout(sheet:number){return this.result<SheetLayout>({op:'layout',sheet});}
 set(sheet:number,address:string,input:string){return this.result<unknown>({op:'set',sheet,address,input});}
 /** One atomic write of a rectangular block (one undo step). All-or-nothing: any invalid cell rejects the whole block. */
 setValues(sheet:number,row:number,col:number,values:string[][]){return this.result<unknown>({op:'setValues',sheet,row,col,values});}
 /** One atomic clear of a block's contents (formats stay), one undo step. */
 clear(sheet:number,row:number,col:number,rows:number,cols:number){return this.result<unknown>({op:'clear',sheet,row,col,rows,cols});}
 /** One typed formatting operation over a block (one undo step). */
 format(sheet:number,row:number,col:number,rows:number,cols:number,format:FormatOp){return this.result<unknown>({op:'format',sheet,row,col,rows,cols,format});}
 /** Resize, autofit, hide or unhide whole rows or columns (one undo step). */
 resize(sheet:number,axis:LineAxis,first:number,count:number,line:LineOp){return this.result<unknown>({op:'resize',sheet,axis,first,count,line});}
 /** Insert or delete whole rows or columns with reference shifting (one undo step). */
 editLines(sheet:number,axis:LineAxis,first:number,count:number,kind:'insert'|'delete'){return this.result<unknown>({op:'editLines',sheet,axis,first,count,line:{kind}});}
 /** Freeze the first rows/columns (0,0 unfreezes), one undo step. */
 freeze(sheet:number,rows:number,cols:number){return this.result<unknown>({op:'freeze',sheet,rows,cols});}
 /** Current sheet list (reload after sheet edits and history). */
 sheets(){return this.result<WorkbookInfo>({op:'sheets'});}
 /** Remove duplicate rows inside the block (one undo step); resolves to the number removed. */
 async dedupe(sheet:number,row:number,col:number,rows:number,cols:number,dedupe:DedupeOp):Promise<number>{const r=await this.result<{removed:unknown}>({op:'dedupe',sheet,row,col,rows,cols,dedupe});return typeof r.removed==='number'?r.removed:0;}
 /** Split one column of text into the empty columns to its right (one undo step). */
 split(sheet:number,row:number,col:number,rows:number,cols:number,split:SplitOp){return this.result<unknown>({op:'split',sheet,row,col,rows,cols,split});}
 /** The column names of the block's first row and whether each is all numbers (read only). */
 async pivotFields(sheet:number,row:number,col:number,rows:number,cols:number):Promise<PivotField[]>{return parsePivotFields(await this.result<{fields:unknown}>({op:'pivotFields',sheet,row,col,rows,cols}));}
 /** Builds a small PivotTable on a new sheet before `sheet` (one undo step); resolves to the report sheet's index. */
 async pivotCreate(sheet:number,row:number,col:number,rows:number,cols:number,pivot:{rows:string;columns?:string;values:string;func?:PivotFunc}):Promise<number>{const r=await this.result<{sheet:unknown}>({op:'pivotCreate',sheet,row,col,rows,cols,pivot});if(typeof r.sheet!=='number')throw Error('The report sheet was not found.');return r.sheet;}
 /** Refreshes every PivotTable from its source (one undo step). */
 pivotRefresh(){return this.result<unknown>({op:'pivotRefresh'});}
 /** The tables of a sheet and the style names to choose from (read only). */
 async tables(sheet:number):Promise<TablesInfo>{return parseTables(await this.result<{tables:unknown;styles:unknown}>({op:'tables',sheet}));}
 /** Creates a table from the block or changes one of the sheet's tables (one undo step). */
 /** The charts of a sheet (read only). */
 async charts(sheet:number):Promise<ChartInfo[]>{return parseCharts(await this.result<unknown>({op:'charts',sheet}));}
 /** One chart drawn as primitives (read only). */
 async chartScene(sheet:number,chart:number):Promise<ChartScene|null>{return parseScene(await this.result<unknown>({op:'chartScene',sheet,chart}));}
 /** The sparklines of a sheet drawn to fit their cells (read only). */
 async sparklines(sheet:number):Promise<SparklineScene[]>{return parseSparklines(await this.result<unknown>({op:'sparklines',sheet}));}
 /** Creates or changes a chart (one undo step). */
 async chartOp(sheet:number,row:number,col:number,rows:number,cols:number,chart:ChartOp):Promise<void>{await this.result<unknown>({op:'chartOp',sheet,row,col,rows,cols,chart});}
 /** Adds a sparkline for a selected row or column in the next cell (one undo step). */
 async sparklineOp(sheet:number,row:number,col:number,rows:number,cols:number,sparkline:SparklineOp):Promise<void>{await this.result<unknown>({op:'sparklineOp',sheet,row,col,rows,cols,sparkline});}
 /** Pictures and shapes of a sheet (read only). */
 /** Merges, justifies, rotates or clears the formats of a block as one undo step. */
 /** Style, AutoSum, checkbox or format painter on a block: one undo step; a rejected promise changed nothing. */
 cellToolOp(sheet:number,row:number,col:number,rows:number,cols:number,tool:CellToolOp){return this.result<unknown>({op:'cellToolOp',sheet,row,col,rows,cols,tool});}
 /** Flash Fill or Consolidate: one undo step; a rejected promise changed nothing. */
 dataToolOp(sheet:number,row:number,col:number,rows:number,cols:number,tool:DataToolOp){return this.result<unknown>({op:'dataToolOp',sheet,row,col,rows,cols,tool});}
 /** The PivotTables of a sheet with layout and source fields (read only). */
 async validationRules(sheet:number):Promise<ValidationListItem[]>{return parseValidationRules(await this.result<unknown>({op:'validationRules',sheet}));}
 validationManage(sheet:number,manage:ValidationManageOp){return this.result<unknown>({op:'validationManage',sheet,manage});}
 async cfRules(sheet:number):Promise<CfRuleInfo[]>{return parseCfRules(await this.result<unknown>({op:'cfRules',sheet}));}
 cfManage(sheet:number,manage:CfManageOp){return this.result<unknown>({op:'cfManage',sheet,manage});}
 async pivotInfo(sheet:number):Promise<PivotReport[]>{return parsePivotReports(await this.result<unknown>({op:'pivotInfo',sheet}));}
 /** Edits a PivotTable: one undo step; a rejected promise changed nothing. */
 pivotEditOp(sheet:number,row:number,col:number,rows:number,cols:number,edit:PivotEditOp){return this.result<unknown>({op:'pivotEditOp',sheet,row,col,rows,cols,edit});}
 /** The built-in function library (read only). */
 async functionCatalog():Promise<FunctionInfo[]>{return parseFunctionCatalog(await this.result<unknown>({op:'functionCatalog'}));}
 layoutOp(sheet:number,row:number,col:number,rows:number,cols:number,layout:LayoutOp){return this.result<unknown>({op:'layoutOp',sheet,row,col,rows,cols,layout});}
 /** Outline summary of a sheet (read only). */
 async outline(sheet:number):Promise<OutlineInfo>{return parseOutlineInfo(await this.result<unknown>({op:'outline',sheet}));}
 /** Groups, collapses or subtotals the selection as one undo step. */
 outlineOp(sheet:number,row:number,col:number,rows:number,cols:number,outline:OutlineOp){return this.result<unknown>({op:'outlineOp',sheet,row,col,rows,cols,outline});}
 /** The saved views of the workbook (read only). */
 async savedViews():Promise<SavedView[]>{return parseSavedViews(await this.result<unknown>({op:'savedViews'}));}
 /** Saves, shows or deletes a named view (not an undo step). `show` returns where the view lands. */
 savedViewOp(sheet:number,row:number,col:number,view:SavedViewOp){return this.result<unknown>({op:'savedViewOp',sheet,row,col,view});}
 async objects(sheet:number):Promise<ObjectsInfo>{return parseObjects(await this.result<unknown>({op:'objects',sheet}));}
 /** One picture as a data URL (read only); null when the format cannot be shown. */
 async imageUrl(sheet:number,image:number):Promise<string|null>{const r=await this.result<{mime?:unknown;base64?:unknown}>({op:'imageData',sheet,image});return typeof r.mime==='string'&&typeof r.base64==='string'?pictureDataUrl(r.mime,r.base64):null;}
 /** Inserts a PNG or JPEG picture at the cell (one undo step). The bytes are copied; the caller keeps the original. */
 async pictureOp(sheet:number,row:number,col:number,bytes:Uint8Array,alt:string,width:number):Promise<void>{const copy=bytes.slice();await this.result<unknown>({op:'pictureOp',sheet,row,col,bytes:copy,alt,width});}
 /** Adds a shape, or moves, resizes or deletes a picture or shape (one undo step). */
 async objectOp(sheet:number,row:number,col:number,object:ObjectOp):Promise<void>{await this.result<unknown>({op:'objectOp',sheet,row,col,object});}
 /** Goal seek, scenarios or a data table on the sheet (one undo step each); returns the engine's result object. */
 whatIfOp(sheet:number,whatIf:WhatIfOp){return this.result<unknown>({op:'whatIfOp',sheet,whatIf});}
 /** The scenarios stored for a sheet (read only). */
 async scenarios(sheet:number):Promise<ScenarioInfo[]>{return parseScenarios(await this.result<unknown>({op:'scenarios',sheet}));}
 /** Protects or unprotects the sheet, locks or unlocks the block, or locks the workbook structure (one undo step). The password is passed through once and not kept. */
 async protectOp(sheet:number,row:number,col:number,rows:number,cols:number,protect:ProtectOp):Promise<void>{await this.result<unknown>({op:'protectOp',sheet,row,col,rows,cols,protect});}
 /** Zoom (10 to 400 percent, not an undo step) or gridlines (one undo step) of a sheet. */
 viewOp(sheet:number,view:ViewOp){return this.result<ViewOpResult>({op:'viewOp',sheet,view});}
 /** The page setup of a sheet (read only). */
 async pageInfo(sheet:number):Promise<PageInfo|null>{return parsePageInfo(await this.result<unknown>({op:'pageInfo',sheet}));}
 /** Changes the page setup of a sheet (one undo step). */
 async pageSetup(sheet:number,page:PageSetupOp):Promise<PageInfo|null>{return parsePageInfo(await this.result<unknown>({op:'pageSetup',sheet,page}));}
 /** Builds a PDF, CSV, TSV or HTML file for download; the workbook is not changed. */
 async exportFile(sheet:number,row:number,col:number,rows:number,cols:number,spec:ExportOp):Promise<ExportResult>{return parseExportResult(await this.result<unknown>({op:'exportFile',sheet,row,col,rows,cols,export:spec}));}
 tableOp(sheet:number,row:number,col:number,rows:number,cols:number,table:TableOp){return this.result<unknown>({op:'tableOp',sheet,row,col,rows,cols,table});}
 /** Defines a name for the block (one undo step). */
 defineName(sheet:number,row:number,col:number,rows:number,cols:number,name:{name:string;scope:'workbook'|'sheet';replace?:boolean}){return this.result<unknown>({op:'defineName',sheet,row,col,rows,cols,name});}
 /** Names from the labels in the top row and/or left column of the block (one undo step). */
 createNames(sheet:number,row:number,col:number,rows:number,cols:number,name:{top?:boolean;left?:boolean;replace?:boolean}){return this.result<unknown>({op:'createNames',sheet,row,col,rows,cols,name});}
 /** The Series dialog: fills the block from its first numbers or dates with a step (one undo step). */
 fillSeries(sheet:number,row:number,col:number,rows:number,cols:number,series:{axis:'down'|'right';kind:'linear'|'growth'|'date';step:number;stop?:number;unit?:'day'|'weekday'|'month'|'year'}){return this.result<unknown>({op:'fillSeries',sheet,row,col,rows,cols,series});}
 /** The fill-handle drag: continues the pattern of the block for `count` more rows or columns (one undo step). */
 autoFill(sheet:number,row:number,col:number,rows:number,cols:number,fill:{dir:'down'|'up'|'right'|'left';count:number;mode?:'copy'|'formats'|'values'}){return this.result<unknown>({op:'autoFill',sheet,row,col,rows,cols,fill});}
 /** Keeps the block in the engine clipboard (cells, formulas, formats) for paste special; with `cut` it moves on paste. No undo step. */
 clipCopy(sheet:number,row:number,col:number,rows:number,cols:number,cut=false){return this.result<unknown>({op:'clipCopy',sheet,row,col,rows,cols,...(cut?{cut:true}:{})});}
 /** Pastes the engine clipboard into the block (one undo step). */
 pasteSpecial(sheet:number,row:number,col:number,rows:number,cols:number,paste:PasteOp){return this.result<unknown>({op:'pasteSpecial',sheet,row,col,rows,cols,paste});}
 /** Sets a name's comment or turns it into a number or text constant (one undo step). */
 editName(sheet:number,name:{kind:'comment'|'constant';name:string;scope:'workbook'|'sheet';text?:string;value?:number|string;replace?:boolean}){return this.result<unknown>({op:'editName',sheet,name});}
 /** Deletes one name (one undo step). `sheet` is the sheet a sheet-scoped name belongs to. */
 /** Renames a name that nothing refers to (formulas are not rewritten, so used names are refused). One undo step. */
 renameName(sheet:number,name:{name:string;scope:'workbook'|'sheet';newName:string}){return this.result<unknown>({op:'renameName',sheet,name});}
 deleteName(sheet:number,name:{name:string;scope:'workbook'|'sheet'}){return this.result<unknown>({op:'deleteName',sheet,name});}
 /** The visible defined names (read only). */
 async names():Promise<NameInfo[]>{return parseNames(await this.result<{names:unknown}>({op:'names'}));}
 /** Adds, answers, resolves or removes a note or comment, or sets or removes a link, on one cell (one undo step). */
 annotate(sheet:number,row:number,col:number,annotate:AnnotateOp){return this.result<unknown>({op:'annotate',sheet,row,col,annotate});}
 /** The note and link of one cell (read only). */
 async auditOp(sheet:number,row:number,col:number,audit:AuditBridgeOp):Promise<AuditAnswer>{return parseAuditAnswer(await this.result<unknown>({op:'auditOp',sheet,row,col,audit}));}
 insertSymbol(sheet:number,row:number,col:number,char:string){return this.result<unknown>({op:'insertSymbol',sheet,row,col,char});}
 async reviewInfo(sheet:number,kind:'stats'|'accessibility'):Promise<ReviewResult>{return parseReviewResult(await this.result<unknown>({op:'reviewInfo',sheet,kind}));}
 async cellInfo(sheet:number,row:number,col:number):Promise<CellInfo>{return parseCellInfo(await this.result<unknown>({op:'cellInfo',sheet,row,col}));}
 async pageBreaks(sheet:number):Promise<PageList>{return parsePageList(await this.result<unknown>({op:'pageBreaks',sheet}));}
 async customStyles():Promise<string[]>{return parseCustomStyles(await this.result<unknown>({op:'customStyles'}));}
 async notesOverview(sheet:number):Promise<NoteList>{return parseNoteList(await this.result<unknown>({op:'notesOverview',sheet}));}
 async annotations(sheet:number,row:number,col:number):Promise<CellAnnotations>{const r=await this.result<{notes:unknown;links:unknown}>({op:'annotations',sheet,row,col});return parseAnnotations(r);}
 /** Replace text in the block (one undo step); resolves to the number of changed cells. */
 async replace(sheet:number,row:number,col:number,rows:number,cols:number,replace:ReplaceOp):Promise<number>{const r=await this.result<{replaced:unknown}>({op:'replace',sheet,row,col,rows,cols,replace});return typeof r.replaced==='number'?r.replaced:0;}
 /** How many cells a replace would change (read only). */
 /** Inserts empty cells or deletes the block and moves the neighbours (one undo step). Refused when the engine would leave merges, tables, charts and the like behind. */
 shiftCells(sheet:number,row:number,col:number,rows:number,cols:number,shift:{kind:'insert'|'delete';shift:'down'|'right'|'up'|'left'}){return this.result<unknown>({op:'shiftCells',sheet,row,col,rows,cols,shift});}
 /** Finds cells by what they are (Go To Special): blanks, formulas, errors and so on. Reads only. */
 async findSpecial(sheet:number,row:number,col:number,rows:number,cols:number,kind:SpecialKind):Promise<SpecialResult>{return parseSpecialResult(await this.result<unknown>({op:'findSpecial',sheet,row,col,rows,cols,kind}));}
 async findCount(sheet:number,row:number,col:number,rows:number,cols:number,replace:ReplaceOp):Promise<number>{const r=await this.result<{count:unknown}>({op:'findCount',sheet,row,col,rows,cols,replace});return typeof r.count==='number'?r.count:0;}
 /** Set or clear data validation on the block (one undo step). */
 validation(sheet:number,row:number,col:number,rows:number,cols:number,validation:ValidationOp){return this.result<unknown>({op:'validation',sheet,row,col,rows,cols,validation});}
 /** Choices of a list validation on one cell, or null. */
 async validationInfo(sheet:number,row:number,col:number):Promise<ValidationRuleInfo|null>{return parseValidationRule(await this.result<unknown>({op:'validationInfo',sheet,row,col}));}
 async validationInvalid(sheet:number):Promise<InvalidCells>{return parseInvalidCells(await this.result<unknown>({op:'validationInvalid',sheet}));}
 async validationItems(sheet:number,row:number,col:number):Promise<string[]|null>{const r=await this.result<{items:unknown}>({op:'validationItems',sheet,row,col});return Array.isArray(r.items)&&r.items.every(x=>typeof x==='string')?r.items as string[]:null;}
 /** Add or clear highlight (conditional format) rules (one undo step). */
 cf(sheet:number,row:number,col:number,rows:number,cols:number,cf:CfOp){return this.result<unknown>({op:'cf',sheet,row,col,rows,cols,cf});}
 /** Fill the block in one direction from its first (last for up/left) row or column (one undo step). */
 fill(sheet:number,row:number,col:number,rows:number,cols:number,dir:FillDirection){return this.result<unknown>({op:'fill',sheet,row,col,rows,cols,dir});}
 /** Filter rows by one column, or clear or remove the filter (one undo step). */
 filter(sheet:number,row:number,col:number,rows:number,cols:number,filter:FilterOp){return this.result<unknown>({op:'filter',sheet,row,col,rows,cols,filter});}
 /** Owner revision and identity token; pin it at review time. */
 nativeState(){return this.result<SheetsNativeState>({op:'nativeState'}).then(parseNativeState);}
 /** Atomic reviewed cell write: token and exact old cell are checked inside the worker's commit; resolves to the owner receipt. A rejected promise whose message starts with 'stale' changed nothing. */
 setReviewed(sheet:number,address:string,token:string,old:{value:unknown;formula:string|null;address:string},input:string){return this.result<SheetsEditReceipt>({op:'setReviewed',sheet,address,token,old:JSON.stringify(old),input}).then(parseEditReceipt);}
 /** Atomic reviewed RANGE write (row-major, at most 1,000 cells): the token and every old cell are checked inside the worker's commit; one undo step; a rejected promise whose message starts with 'stale' changed nothing. */
 setRangeReviewed(sheet:number,row:number,col:number,rows:number,cols:number,token:string,old:{address:string;value:unknown;formula:string|null}[],inputs:string[]){return this.result<SheetsRangeReceipt>({op:'setRangeReviewed',sheet,row,col,rows,cols,token,old:JSON.stringify(old),inputs:JSON.stringify(inputs)}).then(parseRangeReceipt);}
 /** Exact undo of a reviewed range edit; refused (stale) once anything newer happened. */
 undoRangeReviewed(sheet:number,row:number,col:number,rows:number,cols:number,token:string){return this.result<SheetsRangeReceipt>({op:'undoRangeReviewed',sheet,row,col,rows,cols,token}).then(parseRangeReceipt);}
 /** Exact undo of the reviewed edit; refused (stale) once anything newer happened. */
 undoReviewed(sheet:number,address:string,token:string){return this.result<SheetsEditReceipt>({op:'undoReviewed',sheet,address,token}).then(parseEditReceipt);}
 /** Sort the rows of exactly this block (never widened), one undo step. */
 sort(sheet:number,row:number,col:number,rows:number,cols:number,sort:SortOp){return this.result<unknown>({op:'sort',sheet,row,col,rows,cols,sort});}
 /** Add, rename, duplicate, move or delete a sheet (one undo step). Resolves to the sheet to show afterwards. */
 editSheet(sheet:number,line:SheetOp){return this.result<{active:number}>({op:'editSheet',sheet,line});}
 undo(){return this.result<unknown>({op:'undo'});}
 redo(){return this.result<unknown>({op:'redo'});}
 async save():Promise<Uint8Array>{const r=await this.request({op:'save'});if(r.ok&&r.op==='bytes')return new Uint8Array(r.bytes);throw new Error('Unexpected engine response');}
 dispose(error=new Error('Spreadsheet engine closed')){
  if(this.disposed)return;this.disposed=true;this.notifySelectionRead();this.worker.terminate();
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
}
