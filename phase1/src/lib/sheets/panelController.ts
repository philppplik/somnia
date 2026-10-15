import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {parsePanelRange} from './panelModel';
import {MAX_CELL_BYTES,type RangeCell} from './protocol';
import {parseAddress} from './format';
import {parseFormatOp} from './formatOps';
import type {ChartOp,SparklineOp,ProtectOp,WhatIfOp,LayoutOp,CellToolOp,DataToolOp,SavedViewOp,ObjectOp,ViewOp,PageSetupOp,ExportOp,PivotField,PivotOp,TableOp,NameOp,AnnotateOp,DedupeOp,SplitOp,ReplaceOp,ValidationOp,CfOp,FillDirection,FilterOp,SortOp,FormatOp,LineAxis,LineEditKind,LineOp,SheetOp} from './protocol';
import {parseEditLines,parseFreeze,parseLineCommand} from './lineOps';
import {parseSheetOp} from './sheetOps';
import {parseSortCommand} from './sortOps';
import {parseAnnotateCommand} from './notes';
import {parseNamesCommand} from './names';
import {parsePivotCommand,parseTableCommand} from './tableOps';
import {parseProtectCommand} from './protectOps';
import {SHAPES,SHAPE_FILLS,SHAPE_LINES} from './objectOps';
import {parseWhatIfCommand} from './whatIfOps';
import {parseSavedViewCommand} from './savedViews';
import {parseLayoutCommand,MERGE_HOWS,ROTATE_MODES} from './layoutOps';
import {parseDataToolCommand,CONSOLIDATE_FUNCTIONS,MAX_CONSOLIDATE_SOURCES,MAX_SOURCE_CHARS} from './dataToolOps';
import {parseCellToolCommand,AUTOSUM_FUNCTIONS,CELL_STYLES,SIMPLE_CELL_TOOLS,isFunctionName} from './cellToolOps';
import {parseOutlineCommand,SUBTOTAL_FUNCS,type OutlineCommand} from './outlineOps';
import {parseObjectCommand,decodePicture,MAX_PICTURE_BASE64} from './objectOps';
import {parseChartCommand,parseSparklineCommand} from './chartOps';
import {parseViewCommand,type ViewCommand} from './viewOps';
import {parseExportCommand,parsePageSetupCommand} from './printOps';
import {parseDedupeCommand,parseSplitCommand,SPLIT_DELIMITERS} from './dataTools';
import {parseReplaceCommand} from './replaceOps';
import {parseValidationCommand} from './validationOps';
import {CF_BAR_COLORS,CF_ICON_SETS,CF_FLAGS,CF_OPERATORS,CF_SCALES,CF_STYLES,CF_TEXT_MODES,parseCfCommand} from './cfOps';
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
 /** Creates a table from the selection or changes one of the sheet's tables (one undo step). */
 tableOperation(op:TableOp):void|Promise<void>;
 /** Builds a PivotTable from the selection on a new sheet, or refreshes all PivotTables (one undo step). */
 pivotOperation(op:PivotOp):void|Promise<void>;
 /** Creates a chart from the selection or changes, moves, resizes or deletes one of the sheet's charts (one undo step). */
 chartOperation(op:ChartOp):void|Promise<void>;
 /** Adds a sparkline for the selected row or column in the next cell (one undo step). */
 sparklineOperation(op:SparklineOp):void|Promise<void>;
 /** Protects or unprotects the sheet, locks or unlocks the selected cells, or locks the workbook structure (one undo step). */
 protectOperation(op:ProtectOp):void|Promise<void>;
 /** Goal seek, scenarios or a data table (one undo step each). */
 whatIfOperation(op:WhatIfOp):void|Promise<void>;
 /** Adds a shape, or moves, resizes or deletes a picture or shape (one undo step). */
 objectOperation(op:ObjectOp):void|Promise<void>;
 /** Saves, shows or deletes a named view (sheet, selected cell and zoom). Not an undo step. */
 savedViewOperation(op:SavedViewOp):void|Promise<void>;
 /** Groups, collapses or subtotals the selection (one undo step). */
 outlineOperation(op:OutlineCommand):void|Promise<void>;
 /** Merge, justify, rotate, double underline or clear the formats of the selection (one undo step). */
 layoutOperation(op:LayoutOp):void|Promise<void>;
 cellTool(op:CellToolOp):void|Promise<void>;
 dataTool(op:DataToolOp):void|Promise<void>;
 insertFunction(name:string):void|Promise<void>;
 /** Inserts a PNG or JPEG picture at the selected cell (one undo step). */
 insertPicture(picture:{bytes:Uint8Array;alt:string;width:number}):void|Promise<void>;
 /** Sets the zoom, shows or hides gridlines, or zooms to the selection. Zoom is a view setting; gridlines are one undo step. */
 viewOperation(op:ViewCommand):void|Promise<void>;
 /** Changes the page setup of the active sheet (one undo step). */
 pageSetup(op:PageSetupOp):void|Promise<void>;
 /** Builds a PDF, CSV, TSV or HTML file of the active sheet, all sheets or the selection and downloads it (nothing is changed). */
 exportFile(op:ExportOp):void|Promise<void>;
 /** The column names in the first row of the selection. */
 pivotFields():PivotField[]|Promise<PivotField[]>;
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
export const SHEETS_PANEL_COMMAND_IDS=['sheets.navigate','sheets.setCell','sheets.analyzeRange','sheets.format','sheets.resize','sheets.freeze','sheets.editLines','sheets.sheet','sheets.sort','sheets.filter','sheets.fill','sheets.highlight','sheets.validation','sheets.replace','sheets.dedupe','sheets.split','sheets.annotate','sheets.names','sheets.table','sheets.pivot','sheets.pageSetup','sheets.export','sheets.view','sheets.protect','sheets.chart','sheets.sparkline','sheets.whatif','sheets.object','sheets.picture','sheets.savedView','sheets.outline','sheets.cellLayout','sheets.cellTools','sheets.insertFunction','sheets.dataTools'] as const;
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
 {id:'sheets.sheet',title:'Add, rename, duplicate, move, hide, unhide or color a sheet tab',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['add','rename','duplicate','delete','move','hide','unhide','tabColor']},name:{type:'string',minLength:1,maxLength:31},to:{type:'integer',minimum:0,maximum:254},index:{type:'integer',minimum:0,maximum:254},color:{type:'string',pattern:'^(none|#[0-9A-Fa-f]{6})$'}},required:['kind'],additionalProperties:false},
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
  params:{type:'object',properties:{kind:{type:'string',enum:['cell','text','flag','top','scale','bar','icons','clear','clearAll']},color:{type:'string',enum:[...CF_BAR_COLORS]},gradient:{type:'boolean'},set:{type:'string',enum:[...CF_ICON_SETS]},reverse:{type:'boolean'},operator:{type:'string',enum:[...CF_OPERATORS]},value:{type:['string','number'],maxLength:255},value2:{type:['string','number'],maxLength:255},mode:{type:'string',enum:[...CF_TEXT_MODES]},text:{type:'string',minLength:1,maxLength:255},flag:{type:'string',enum:[...CF_FLAGS]},rank:{type:'integer',minimum:1,maximum:1000},bottom:{type:'boolean'},percent:{type:'boolean'},scale:{type:'string',enum:[...CF_SCALES]},style:{type:'string',enum:[...CF_STYLES]}},required:['kind'],additionalProperties:false},
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
 {id:'sheets.table',title:'Create or change a table',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['create','totals','banded','style','rename','convert','resize']},table:{type:'string',minLength:1,maxLength:64},name:{type:'string',minLength:1,maxLength:64},newName:{type:'string',minLength:1,maxLength:64},style:{type:'string',maxLength:40},on:{type:'boolean'}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().tableOperation(parseTableCommand(p))},
 {id:'sheets.pivot',title:'Build or refresh a PivotTable',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['create','refresh']},rows:{type:'string',minLength:1,maxLength:255},columns:{type:'string',minLength:1,maxLength:255},values:{type:'string',minLength:1,maxLength:255},func:{type:'string',enum:['sum','count','average','max','min']}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().pivotOperation(parsePivotCommand(p))},
 {id:'sheets.chart',title:'Create or change a chart',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['create','set','switch','delete']},chart:{type:'integer',minimum:0},type:{type:'string',enum:['column','bar','line','pie','doughnut','area','scatter','radar','histogram','waterfall','funnel','treemap']},subtype:{type:'string',enum:['clustered','stacked','stacked100','markers','lines']},title:{type:'string',maxLength:120},xTitle:{type:'string',maxLength:120},yTitle:{type:'string',maxLength:120},legend:{type:'string',enum:['none','bottom','top','left','right']},dataLabels:{type:'boolean'},gridlines:{type:'boolean'},style:{type:'integer',minimum:1,maximum:16},at:{type:'string',maxLength:12},width:{type:'integer',minimum:20,maximum:4000},height:{type:'integer',minimum:20,maximum:4000}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().chartOperation(parseChartCommand(p))},
 {id:'sheets.sparkline',title:'Add a sparkline',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{type:{type:'string',enum:['line','column','winLoss']},markers:{type:'boolean'}},additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().sparklineOperation(parseSparklineCommand(p))},
 {id:'sheets.whatif',title:'Run goal seek, scenarios or a data table',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['goalSeek','scenarioAdd','scenarioShow','scenarioDelete','scenarioSummary','dataTable']},set:{type:'string',maxLength:12},to:{type:'number'},changing:{type:'string',maxLength:200},name:{type:'string',minLength:1,maxLength:255},values:{type:'array',items:{type:['string','number','boolean','null'],maxLength:255},maxItems:32},comment:{type:'string',maxLength:255},replace:{type:'boolean'},resultCells:{type:'string',maxLength:200},range:{type:'string',maxLength:30},rowInput:{type:'string',maxLength:12},columnInput:{type:'string',maxLength:12}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().whatIfOperation(parseWhatIfCommand(p))},
 {id:'sheets.object',title:'Add a shape, or move, resize or delete a picture or shape',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['shape','move','delete']},shape:{type:'string',enum:[...SHAPES]},fill:{type:'string',enum:[...SHAPE_FILLS]},line:{type:'string',enum:[...SHAPE_LINES]},width:{type:'number',minimum:0,maximum:4000},height:{type:'number',minimum:0,maximum:4000},text:{type:'string',maxLength:200},object:{type:'string',enum:['image','shape']},id:{type:'integer',minimum:0},here:{type:'boolean'}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().objectOperation(parseObjectCommand(p))},
 {id:'sheets.picture',title:'Insert a PNG or JPEG picture',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{base64:{type:'string',minLength:8,maxLength:MAX_PICTURE_BASE64},alt:{type:'string',maxLength:255},width:{type:'number',minimum:16,maximum:2000}},required:['base64'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().insertPicture(decodePicture(p))},
 {id:'sheets.savedView',title:'Save, show or delete a named view',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['save','show','delete']},name:{type:'string',minLength:1,maxLength:64}},required:['kind','name'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().savedViewOperation(parseSavedViewCommand(p))},
 {id:'sheets.outline',title:'Group, collapse or subtotal the selected rows or columns',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['group','ungroup','hide','show','subtotal']},axis:{type:'string',enum:['rows','cols']},groupBy:{type:'string',pattern:'^[A-Za-z]{1,3}$'},function:{type:'string',enum:[...SUBTOTAL_FUNCS]},columns:{type:'array',items:{type:'string',pattern:'^[A-Za-z]{1,3}$'},minItems:1,maxItems:8}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().outlineOperation(parseOutlineCommand(p))},
 {id:'sheets.cellLayout',title:'Merge, justify, rotate or clear the formats of the selected cells',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['merge','justify','rotate','doubleUnderline','clearFormats']},how:{type:'string',enum:[...MERGE_HOWS]},mode:{type:'string',enum:[...ROTATE_MODES]},on:{type:'boolean'}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().layoutOperation(parseLayoutCommand(p))},
 {id:'sheets.cellTools',title:'Apply a cell style, AutoSum, checkboxes or copy and paste formats',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['style','autoSum',...SIMPLE_CELL_TOOLS]},name:{type:'string',enum:[...CELL_STYLES]},function:{type:'string',enum:[...AUTOSUM_FUNCTIONS]}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().cellTool(parseCellToolCommand(p))},
 {id:'sheets.dataTools',title:'Flash Fill a column from examples or consolidate ranges',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['flashFill','consolidate']},function:{type:'string',enum:[...CONSOLIDATE_FUNCTIONS]},sources:{type:'array',minItems:1,maxItems:MAX_CONSOLIDATE_SOURCES,items:{type:'string',maxLength:MAX_SOURCE_CHARS}},topRow:{type:'boolean'},leftColumn:{type:'boolean'}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().dataTool(parseDataToolCommand(p))},
 {id:'sheets.insertFunction',title:'Start a formula with a function from the library',category:'Edit',level:'ui',allowInInput:false,
  params:{type:'object',properties:{name:{type:'string',maxLength:64}},required:['name'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>{const o=p as {name?:unknown};if(!o||typeof o!=='object'||Object.keys(o).some(k=>k!=='name')||!isFunctionName(o.name))throw Error('Invalid function name.');return requireController().insertFunction(o.name);}},
 {id:'sheets.protect',title:'Protect a sheet or lock cells',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{kind:{type:'string',enum:['protect','unprotect','lock','workbook']},password:{type:'string',maxLength:64},allow:{type:'array',items:{type:'string',enum:['formatCells','formatColumns','formatRows','insertColumns','insertRows','deleteColumns','deleteRows','sort','autofilter']},maxItems:9},locked:{type:'boolean'},on:{type:'boolean'}},required:['kind'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().protectOperation(parseProtectCommand(p))},
 {id:'sheets.view',title:'Zoom, gridlines, headings and zeros',category:'View',level:'ui',allowInInput:true,
  params:{type:'object',properties:{zoom:{type:'integer',minimum:10,maximum:400},gridlines:{type:'boolean'},headings:{type:'boolean'},zeros:{type:'boolean'},fit:{type:'string',enum:['selection']}},additionalProperties:false,minProperties:1,maxProperties:1},
  enabled:()=>!!current?.ready(),run:p=>requireController().viewOperation(parseViewCommand(p))},
 {id:'sheets.pageSetup',title:'Change the page setup',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{orientation:{type:'string',enum:['portrait','landscape']},paper:{type:'string',enum:['Letter','Legal','A4','A3','A5','Tabloid','Executive']},margins:{type:'string',enum:['normal','wide','narrow']},scale:{type:'integer',minimum:10,maximum:400},fitWidth:{type:'integer',minimum:0,maximum:20},fitHeight:{type:'integer',minimum:0,maximum:20},centerH:{type:'boolean'},centerV:{type:'boolean'},gridlines:{type:'boolean'},headings:{type:'boolean'},header:{type:'string',maxLength:100},footer:{type:'string',maxLength:100},printArea:{type:['string','null'],maxLength:40},titleRows:{type:['string','null'],maxLength:20},titleCols:{type:['string','null'],maxLength:20}},additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().pageSetup(parsePageSetupCommand(p))},
 {id:'sheets.export',title:'Export as PDF, CSV, TSV or HTML',category:'Edit',level:'ui',allowInInput:true,
  params:{type:'object',properties:{format:{type:'string',enum:['pdf','csv','tsv','html']},scope:{type:'string',enum:['sheet','all','selection']},fit:{type:'boolean'}},required:['format'],additionalProperties:false},
  enabled:()=>!!current?.ready(),run:p=>requireController().exportFile(parseExportCommand(p))},
 ];
}
export function registerSheetsPanelCommands(){const offs=sheetsPanelCommandSpecs().map(s=>registerCommandSpec(s));return()=>offs.forEach(off=>off());}
