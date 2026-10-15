/// <reference lib="webworker" />
import init,{HeadlessWorkbook} from '../../../sheets-craft/pkg/somnia_sheets_craft.js';
import {clockKey,localSerial} from './clock';
import type {SheetsRequest,SheetsResponse} from './protocol';
const scope=self as unknown as DedicatedWorkerGlobalScope;
let ready:Promise<unknown>|undefined;let book:HeadlessWorkbook|undefined;let clockSent=NaN;
/** Host clock for NOW()/TODAY(): sent after open and whenever the local minute changes, so edits never see the wasm fixed fallback. An unusable clock keeps the previous one. */
const syncClock=(b:HeadlessWorkbook,force=false)=>{const s=localSerial();if(s===null)return;const k=clockKey(s);if(!force&&k===clockSent)return;b.set_clock(s);clockSent=k;};
// Serial queue: one session, requests never interleave.
let queue:Promise<void>=Promise.resolve();
scope.onmessage=({data}:MessageEvent<SheetsRequest>)=>{queue=queue.then(async()=>{
 const t=performance.now();const send=(m:SheetsResponse,transfer:Transferable[]=[])=>scope.postMessage(m,transfer);
 try{
  if(data.op==='init'){ready??=init({module_or_path:data.wasmUrl});await ready;send({id:data.id,ok:true,op:'result',result:{ready:true},ms:performance.now()-t});return;}
  if(!ready)throw new Error('engine not initialized');await ready;
  const need=()=>{if(!book)throw new Error('No workbook is open');return book;};
  let result:unknown;
  switch(data.op){
   case 'open':{const next=new HeadlessWorkbook(new Uint8Array(data.bytes));syncClock(next,true);book?.free();book=next;result=JSON.parse(next.sheets());break;}
   case 'info':result=JSON.parse(need().sheet_info(data.sheet));break;
   case 'range':result=JSON.parse(need().range(data.sheet,data.row,data.col,data.rows,data.cols));break;
   case 'view':result=JSON.parse(need().view_range(data.sheet,data.row,data.col,data.rows,data.cols));break;
   case 'layout':result=JSON.parse(need().layout(data.sheet));break;
   case 'set':syncClock(need());result=JSON.parse(need().set_cell(data.sheet,data.address,data.input));break;
   case 'setValues':syncClock(need());result=JSON.parse(need().set_values(data.sheet,data.row,data.col,JSON.stringify(data.values)));break;
   case 'clear':syncClock(need());result=JSON.parse(need().clear_contents(data.sheet,data.row,data.col,data.rows,data.cols));break;
   case 'format':result=JSON.parse(need().format_range(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.format)));break;
   case 'resize':result=JSON.parse(need().resize_lines(data.sheet,data.axis,data.first,data.count,JSON.stringify(data.line)));break;
   case 'editLines':result=JSON.parse(need().edit_lines(data.sheet,data.axis,data.first,data.count,JSON.stringify(data.line)));break;
   case 'freeze':result=JSON.parse(need().freeze_panes(data.sheet,data.rows,data.cols));break;
   case 'nativeState':result=JSON.parse(need().native_state());break;
   case 'setReviewed':result=JSON.parse(need().set_cell_reviewed(data.sheet,data.address,data.token,data.old,data.input));break;
   case 'undoReviewed':result=JSON.parse(need().undo_reviewed(data.sheet,data.address,data.token));break;
   case 'sheets':result=JSON.parse(need().sheets());break;
   case 'validation':result=JSON.parse(need().validation_range(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.validation)));break;
   case 'validationItems':result=JSON.parse(need().validation_items(data.sheet,data.row,data.col));break;
   case 'replace':result=JSON.parse(need().replace_range(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.replace)));break;
   case 'findCount':result=JSON.parse(need().find_count(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.replace)));break;
   case 'dedupe':result=JSON.parse(need().remove_duplicates(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.dedupe)));break;
   case 'split':result=JSON.parse(need().text_to_columns(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.split)));break;
   case 'annotate':result=JSON.parse(need().annotate_cell(data.sheet,data.row,data.col,JSON.stringify(data.annotate)));break;
   case 'annotations':result=JSON.parse(need().annotations(data.sheet,data.row,data.col,1,1));break;
   case 'defineName':result=JSON.parse(need().define_name(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.name)));break;
   case 'deleteName':result=JSON.parse(need().delete_name(data.sheet,JSON.stringify(data.name)));break;
   case 'names':result=JSON.parse(need().list_names());break;
   case 'pivotFields':result=JSON.parse(need().pivot_fields(data.sheet,data.row,data.col,data.rows,data.cols));break;
   case 'pivotCreate':result=JSON.parse(need().pivot_create(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.pivot)));break;
   case 'pivotRefresh':result=JSON.parse(need().pivot_refresh());break;
   case 'tables':result=JSON.parse(need().tables_info(data.sheet));break;
   case 'outline':result=JSON.parse(need().outline_info(data.sheet));break;
   case 'outlineOp':result=JSON.parse(need().outline_op(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.outline)));break;
   case 'savedViews':result=JSON.parse(need().saved_views());break;
   case 'savedViewOp':result=JSON.parse(need().saved_view_op(data.sheet,data.row,data.col,JSON.stringify(data.view)));break;
   case 'objects':result=JSON.parse(need().objects_info(data.sheet));break;
   case 'imageData':result=JSON.parse(need().image_data(data.sheet,data.image));break;
   case 'pictureOp':result=JSON.parse(need().insert_picture(data.sheet,data.row,data.col,data.bytes,data.alt,data.width));break;
   case 'objectOp':result=JSON.parse(need().object_op(data.sheet,data.row,data.col,JSON.stringify(data.object)));break;
   case 'whatIfOp':result=JSON.parse(need().whatif_op(data.sheet,JSON.stringify(data.whatIf)));break;
   case 'scenarios':result=JSON.parse(need().scenarios_info(data.sheet));break;
   case 'protectOp':result=JSON.parse(need().protect_op(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.protect)));break;
   case 'charts':result=JSON.parse(need().charts_info(data.sheet));break;
   case 'chartScene':result=JSON.parse(need().chart_scene(data.sheet,data.chart));break;
   case 'sparklines':result=JSON.parse(need().sparklines_info(data.sheet));break;
   case 'chartOp':result=JSON.parse(need().chart_op(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.chart)));break;
   case 'sparklineOp':result=JSON.parse(need().sparkline_op(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.sparkline)));break;
   case 'viewOp':result=JSON.parse(need().view_op(data.sheet,JSON.stringify(data.view)));break;
   case 'pageInfo':result=JSON.parse(need().page_info(data.sheet));break;
   case 'pageSetup':result=JSON.parse(need().page_setup(data.sheet,JSON.stringify(data.page)));break;
   case 'exportFile':result=JSON.parse(need().export_file(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.export)));break;
   case 'tableOp':result=JSON.parse(need().table_op(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.table)));break;
   case 'cf':result=JSON.parse(need().cf_range(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.cf)));break;
   case 'fill':result=JSON.parse(need().fill_range(data.sheet,data.row,data.col,data.rows,data.cols,data.dir));break;
   case 'filter':result=JSON.parse(need().filter_range(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.filter)));break;
   case 'sort':result=JSON.parse(need().sort_range(data.sheet,data.row,data.col,data.rows,data.cols,JSON.stringify(data.sort)));break;
   case 'editSheet':result=JSON.parse(need().edit_sheet(data.sheet,JSON.stringify(data.line)));break;
   case 'undo':syncClock(need());result=JSON.parse(need().undo());break;
   case 'redo':syncClock(need());result=JSON.parse(need().redo());break;
   case 'save':{const bytes=need().export_xlsx();const buffer=bytes.buffer as ArrayBuffer;send({id:data.id,ok:true,op:'bytes',bytes:buffer,ms:performance.now()-t},[buffer]);return;}
   case 'close':book?.free();book=undefined;result={closed:true};break;
   default:throw new Error('Unsupported operation');}
  send({id:data.id,ok:true,op:'result',result,ms:performance.now()-t});
 }catch(e){send({id:data.id,ok:false,error:e instanceof Error?e.message:String(e)});}
});};
