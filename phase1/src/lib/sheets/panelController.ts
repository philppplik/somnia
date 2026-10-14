import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {parsePanelRange} from './panelModel';
import {MAX_CELL_BYTES,type RangeCell} from './protocol';
import {parseAddress} from './format';
import {parseFormatOp} from './formatOps';
import type {SortOp,FormatOp,LineAxis,LineEditKind,LineOp,SheetOp} from './protocol';
import {parseEditLines,parseFreeze,parseLineCommand} from './lineOps';
import {parseSheetOp} from './sheetOps';
import {parseSortCommand} from './sortOps';
export interface SheetsPanelController {
 ready():boolean;
 navigate(sheet:number,address:string):void|Promise<void>;
 setCell(input:string):void|Promise<void>;
 readRange(input:string):Promise<RangeCell[]>;
 /** Applies one validated formatting operation to the current selection as one undo step. */
 formatCells(op:FormatOp):void|Promise<void>;
 /** Resizes/autofits/hides the rows or columns spanned by the selection (one undo step). */
 resizeLines(axis:LineAxis,op:LineOp):void|Promise<void>;
 /** Inserts or deletes the rows or columns spanned by the selection, shifting references (one undo step). */
 editLines(axis:LineAxis,kind:LineEditKind):void|Promise<void>;
 /** Freezes the first rows/columns (0,0 unfreezes), one undo step. */
 freezePanes(rows:number,cols:number):void|Promise<void>;
 /** Adds, renames, duplicates, moves or deletes the current sheet (one undo step); the grid shows the resulting sheet. */
 editSheet(op:SheetOp):void|Promise<void>;
 /** Sorts the rows of the selected block (never widened) by one column, one undo step. */
 sortRange(op:SortOp):void|Promise<void>;
}
let current:SheetsPanelController|null=null;
export const getSheetsPanelController=()=>current;
export function registerSheetsPanelController(controller:SheetsPanelController){current=controller;return()=>{if(current===controller)current=null;};}
const requireController=()=>{if(!current?.ready())throw Error('No workbook is ready.');return current;};
export const SHEETS_PANEL_COMMAND_IDS=['sheets.navigate','sheets.setCell','sheets.analyzeRange','sheets.format','sheets.resize','sheets.freeze','sheets.editLines','sheets.sheet','sheets.sort'] as const;
export function sheetsPanelCommandSpecs():CommandSpec[]{
 return [
 {id:'sheets.navigate',title:'Go to spreadsheet cell',category:'View',level:'ui',allowInInput:true,
  params:{type:'object',properties:{sheet:{type:'integer',minimum:0},address:{type:'string',minLength:2,maxLength:10}},required:['sheet','address'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>{const {sheet,address}=p as {sheet:number;address:string};if(!parseAddress(address))throw Error('Invalid cell address.');return requireController().navigate(sheet,address);}},
 {id:'sheets.setCell',title:'Apply cell value or formula',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{input:{type:'string',maxLength:MAX_CELL_BYTES}},required:['input'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>{const {input}=p as {input:string};if(new TextEncoder().encode(input).length>MAX_CELL_BYTES)throw Error('Cell input is too long.');return requireController().setCell(input);}},
 {id:'sheets.analyzeRange',title:'Analyze spreadsheet range',category:'Tools',level:'ui',allowInInput:true,
  params:{type:'object',properties:{range:{type:'string',minLength:2,maxLength:24}},required:['range'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>{const {range}=p as {range:string};if(!parsePanelRange(range))throw Error('Invalid or oversized range.');return requireController().readRange(range);}},
 {id:'sheets.format',title:'Format selected cells',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['bold','italic','underline','strike','fontName','fontSize','fontColor','fillColor','numFmt','decimals','hAlign','vAlign','wrap','indent','borders']},align:{type:'string',enum:['left','center','right','top','middle','bottom']},style:{type:'string',enum:['thin','medium','thick','dashed','dotted','double','hair']},on:{type:'boolean'},preset:{type:'string',enum:['general','number','comma','percent','currency','date','time','scientific','text','none','all','outside','thickOutside','inside','insideHorizontal','insideVertical','top','bottom','left','right','thickBottom','doubleBottom','topBottom','topThickBottom','topDoubleBottom']},decimals:{type:'integer',minimum:0,maximum:10},symbol:{type:'string',minLength:1,maxLength:3},delta:{type:'integer',minimum:-1,maximum:1},name:{type:'string',minLength:1,maxLength:64},size:{type:'number',minimum:1,maximum:409},color:{type:'string',minLength:4,maxLength:7}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().formatCells(parseFormatOp(p))},
 {id:'sheets.resize',title:'Resize, autofit or hide rows and columns',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{axis:{type:'string',enum:['rows','cols']},kind:{type:'string',enum:['size','autofit','hide','unhide']},px:{type:'number',minimum:0,maximum:2400}},required:['axis','kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>{const {axis,op}=parseLineCommand(p);return requireController().resizeLines(axis,op);}},
 {id:'sheets.editLines',title:'Insert or delete rows and columns',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{axis:{type:'string',enum:['rows','cols']},kind:{type:'string',enum:['insertBefore','insertAfter','delete']}},required:['axis','kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>{const {axis,kind}=parseEditLines(p);return requireController().editLines(axis,kind);}},
 {id:'sheets.freeze',title:'Freeze panes',category:'View',level:'ui',allowInInput:true,
  params:{type:'object',properties:{rows:{type:'integer',minimum:0,maximum:20},cols:{type:'integer',minimum:0,maximum:20}},required:['rows','cols'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>{const {rows,cols}=parseFreeze(p);return requireController().freezePanes(rows,cols);}},
 {id:'sheets.sheet',title:'Add, rename, duplicate, move or delete the current sheet',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['add','rename','duplicate','delete','move']},name:{type:'string',minLength:1,maxLength:31},to:{type:'integer',minimum:0,maximum:254}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().editSheet(parseSheetOp(p))},
 {id:'sheets.sort',title:'Sort the selected rows by a column',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{column:{type:'integer',minimum:0,maximum:16383},order:{type:'string',enum:['asc','desc']},header:{type:'boolean'}},required:['column','order','header'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().sortRange(parseSortCommand(p))},
 ];
}
export function registerSheetsPanelCommands(){const offs=sheetsPanelCommandSpecs().map(s=>registerCommandSpec(s));return()=>offs.forEach(off=>off());}
