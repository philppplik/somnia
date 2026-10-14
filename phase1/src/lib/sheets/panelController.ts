import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {parsePanelRange} from './panelModel';
import {MAX_CELL_BYTES,type RangeCell} from './protocol';
import {parseAddress} from './format';
import {parseFormatOp} from './formatOps';
import type {FormatOp,SheetOp} from './protocol';
import {parseSheetOp} from './sheetOps';
export interface SheetsPanelController {
 ready():boolean;
 navigate(sheet:number,address:string):void|Promise<void>;
 setCell(input:string):void|Promise<void>;
 readRange(input:string):Promise<RangeCell[]>;
 /** Applies one validated formatting operation to the current selection as one undo step. */
 formatCells(op:FormatOp):void|Promise<void>;
 /** Adds, renames, duplicates, moves or deletes the current sheet (one undo step); the grid shows the resulting sheet. */
 editSheet(op:SheetOp):void|Promise<void>;
}
let current:SheetsPanelController|null=null;
export const getSheetsPanelController=()=>current;
export function registerSheetsPanelController(controller:SheetsPanelController){current=controller;return()=>{if(current===controller)current=null;};}
const requireController=()=>{if(!current?.ready())throw Error('No workbook is ready.');return current;};
export const SHEETS_PANEL_COMMAND_IDS=['sheets.navigate','sheets.setCell','sheets.analyzeRange','sheets.format','sheets.sheet'] as const;
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
 {id:'sheets.sheet',title:'Add, rename, duplicate, move or delete the current sheet',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['add','rename','duplicate','delete','move']},name:{type:'string',minLength:1,maxLength:31},to:{type:'integer',minimum:0,maximum:254}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().editSheet(parseSheetOp(p))},
 ];
}
export function registerSheetsPanelCommands(){const offs=sheetsPanelCommandSpecs().map(s=>registerCommandSpec(s));return()=>offs.forEach(off=>off());}
