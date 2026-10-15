import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {parsePanelRange} from './panelModel';
import {MAX_CELL_BYTES,type RangeCell} from './protocol';
import {parseAddress} from './format';
import {parseFormatOp} from './formatOps';
import type {NameOp,AnnotateOp,DedupeOp,SplitOp,ReplaceOp,ValidationOp,CfOp,FillDirection,FilterOp,SortOp,FormatOp,LineAxis,LineEditKind,LineOp,SheetOp} from './protocol';
import {parseEditLines,parseFreeze,parseLineCommand} from './lineOps';
import {parseSheetOp} from './sheetOps';
import {parseSortCommand} from './sortOps';
import {parseAnnotateCommand} from './notes';
import {parseNamesCommand} from './names';
import {parseDedupeCommand,parseSplitCommand,SPLIT_DELIMITERS} from './dataTools';
import {parseReplaceCommand} from './replaceOps';
import {parseValidationCommand} from './validationOps';
import {CF_FLAGS,CF_OPERATORS,CF_SCALES,CF_STYLES,CF_TEXT_MODES,parseCfCommand} from './cfOps';
import {FILL_DIRECTIONS,parseFillCommand} from './fillOps';
import {FILTER_CONDITIONS,parseFilterCommand} from './filterOps';
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
 /** Filters rows by one column (the selection only creates the filter), or clears/removes it, one undo step. */
 filterRows(op:FilterOp):void|Promise<void>;
 /** Fills the selected block in one direction (one undo step). */
 fillRange(dir:FillDirection):void|Promise<void>;
 /** Adds or clears highlight rules on the selected block (one undo step). */
 highlightRules(op:CfOp):void|Promise<void>;
 /** Sets or clears data validation on the selected block (one undo step). */
 setValidation(op:ValidationOp):void|Promise<void>;
 /** Replaces text in the selected block (one undo step); resolves to the number of changed cells. */
 /** Adds, answers, resolves or removes a note, comment or link on the active cell (one undo step). */
 annotateCell(op:AnnotateOp):void|Promise<void>;
 /** Defines (for the selected block) or deletes a name; one undo step. */
 nameOperation(op:NameOp):void|Promise<void>;
 replaceText(op:ReplaceOp):number|Promise<number>;
 /** Removes duplicate rows inside the selected block (one undo step); resolves to the number removed. */
 removeDuplicates(op:DedupeOp):number|Promise<number>;
 /** Splits the selected column of text into the empty columns to its right (one undo step). */
 splitColumn(op:SplitOp):void|Promise<void>;
 /** How many cells a replace in the selected block would change. */
 countMatches(op:ReplaceOp):number|Promise<number>;
}
let current:SheetsPanelController|null=null;
export const getSheetsPanelController=()=>current;
export function registerSheetsPanelController(controller:SheetsPanelController){current=controller;return()=>{if(current===controller)current=null;};}
const requireController=()=>{if(!current?.ready())throw Error('No workbook is ready.');return current;};
export const SHEETS_PANEL_COMMAND_IDS=['sheets.navigate','sheets.setCell','sheets.analyzeRange','sheets.format','sheets.resize','sheets.freeze','sheets.editLines','sheets.sheet','sheets.sort','sheets.filter','sheets.fill','sheets.highlight','sheets.validation','sheets.replace','sheets.dedupe','sheets.split','sheets.annotate','sheets.names'] as const;
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
  params:{type:'object',properties:{kind:{type:'string',enum:['bold','italic','underline','strike','fontName','fontSize','fontColor','fillColor','numFmt','numFmtCustom','dateFmt','decimals','hAlign','vAlign','wrap','indent','borders']},align:{type:'string',enum:['left','center','right','top','middle','bottom']},style:{type:'string',enum:['thin','medium','thick','dashed','dotted','double','hair']},on:{type:'boolean'},preset:{type:'string',enum:['general','number','comma','percent','currency','date','time','scientific','text','none','all','outside','thickOutside','inside','insideHorizontal','insideVertical','top','bottom','left','right','thickBottom','doubleBottom','topBottom','topThickBottom','topDoubleBottom']},decimals:{type:'integer',minimum:0,maximum:10},grouping:{type:'boolean'},percent:{type:'boolean'},prefix:{type:'string',maxLength:12},suffix:{type:'string',maxLength:12},negative:{type:'string',enum:['minus','red','paren','redParen']},zero:{type:'string',enum:['show','dash']},pattern:{type:'string',enum:['ymd','dmyDot','mdy','dmy','long','weekday','short','monthYear','time24','time12','dateTime']},symbol:{type:'string',minLength:1,maxLength:3},delta:{type:'integer',minimum:-1,maximum:1},name:{type:'string',minLength:1,maxLength:64},size:{type:'number',minimum:1,maximum:409},color:{type:'string',minLength:4,maxLength:7}},required:['kind'],additionalProperties:false},
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
 {id:'sheets.filter',title:'Filter rows by a column',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['custom','clear','clearAll','off']},column:{type:'integer',minimum:0,maximum:16383},op:{type:'string',enum:[...FILTER_CONDITIONS]},value:{type:'string',minLength:1,maxLength:255}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().filterRows(parseFilterCommand(p))},
 {id:'sheets.fill',title:'Fill the selected block down, right, up or left',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{dir:{type:'string',enum:[...FILL_DIRECTIONS]}},required:['dir'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().fillRange(parseFillCommand(p).dir)},
 {id:'sheets.highlight',title:'Highlight cells with a rule or color scale',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['cell','text','flag','top','scale','clear','clearAll']},operator:{type:'string',enum:[...CF_OPERATORS]},value:{type:['string','number'],maxLength:255},value2:{type:['string','number'],maxLength:255},mode:{type:'string',enum:[...CF_TEXT_MODES]},text:{type:'string',minLength:1,maxLength:255},flag:{type:'string',enum:[...CF_FLAGS]},rank:{type:'integer',minimum:1,maximum:1000},bottom:{type:'boolean'},percent:{type:'boolean'},scale:{type:'string',enum:[...CF_SCALES]},style:{type:'string',enum:[...CF_STYLES]}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().highlightRules(parseCfCommand(p))},
 {id:'sheets.validation',title:'Limit what can be typed into the selected cells',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['list','listRange','number','length','clear']},items:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:100},source:{type:'string',maxLength:20},whole:{type:'boolean'},operator:{type:'string',enum:[...CF_OPERATORS]},value:{type:'number'},value2:{type:'number'}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().setValidation(parseValidationCommand(p))},
 {id:'sheets.replace',title:'Replace text in the selected cells',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{what:{type:'string',minLength:1,maxLength:255},with:{type:'string',maxLength:255},matchCase:{type:'boolean'},wholeCell:{type:'boolean'},inFormulas:{type:'boolean'}},required:['what','with','matchCase','wholeCell','inFormulas'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:async p=>{await requireController().replaceText(parseReplaceCommand(p));}},
 {id:'sheets.dedupe',title:'Remove duplicate rows in the selected block',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{header:{type:'boolean'},columns:{type:'array',items:{type:'integer',minimum:0,maximum:16383},minItems:1,maxItems:16384}},required:['header','columns'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:async p=>{await requireController().removeDuplicates(parseDedupeCommand(p));}},
 {id:'sheets.split',title:'Split the selected column of text into columns',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['delimited','fixed']},delimiters:{type:'array',items:{type:'string',enum:[...SPLIT_DELIMITERS]},minItems:1,maxItems:5},treatConsecutive:{type:'boolean'},widths:{type:'array',items:{type:'integer',minimum:1,maximum:255},minItems:1,maxItems:19}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().splitColumn(parseSplitCommand(p))},
 {id:'sheets.annotate',title:'Add a note, comment or link to the active cell',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['note','comment','reply','resolve','remove','link','unlink']},text:{type:'string',maxLength:2000},resolved:{type:'boolean'},target:{type:'string',maxLength:2048},tooltip:{type:'string',maxLength:255}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().annotateCell(parseAnnotateCommand(p))},
 {id:'sheets.names',title:'Define or delete a named range',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['define','delete']},name:{type:'string',minLength:1,maxLength:64},scope:{type:'string',enum:['workbook','sheet']},replace:{type:'boolean'}},required:['kind','name'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().nameOperation(parseNamesCommand(p))},
 ];
}
export function registerSheetsPanelCommands(){const offs=sheetsPanelCommandSpecs().map(s=>registerCommandSpec(s));return()=>offs.forEach(off=>off());}
