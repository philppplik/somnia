import {useSyncExternalStore} from 'react';
import type {Rect} from './clipboard';
import type {NoteList} from './notes';
import type {TraceInfo,ErrorsInfo,WatchRow} from './audit';
import type {ReviewResult} from './reviewInfo';
import type {CellInfo} from './cellInfo';
import type {PageList} from './pageBreaks';
import type {InvalidCells,ValidationRuleInfo,CfRuleInfo,PivotReport,FunctionInfo,OutlineInfo,SavedView,ObjectsInfo,ScenarioInfo,ChartInfo,PageInfo,TablesInfo,NameInfo,CellAnnotations,CellStyle,WorkbookInfo,SheetInfo,SheetLayout} from './protocol';
/** Selection shared between the grid canvas and the inspector. Session-only, never persisted. */
export interface SheetsSelection{editing?:boolean;file:string;sheet:number;sheetName:string;address:string;kind:string;text:string;formula:string|null;dirty:boolean;canUndo:boolean;canRedo:boolean;range?:Rect;workbook?:WorkbookInfo;info?:SheetInfo|null;layout?:SheetLayout|null;style?:CellStyle;revision?:number;listItems?:readonly string[]|null;annotations?:CellAnnotations|null;names?:readonly NameInfo[];scenarios?:readonly ScenarioInfo[];objects?:ObjectsInfo;savedViews?:readonly SavedView[];functions?:readonly FunctionInfo[];pivots?:readonly PivotReport[];cfRules?:readonly CfRuleInfo[];noteList?:NoteList|null;customStyles?:readonly string[];auditResult?:{trace?:TraceInfo;errors?:ErrorsInfo}|null;watchRows?:readonly WatchRow[];reviewResult?:ReviewResult|null;cellInfo?:CellInfo|null;pageList?:PageList|null;validationRule?:ValidationRuleInfo|null;invalidCells?:InvalidCells|null;outline?:OutlineInfo|null;tables?:TablesInfo|null;page?:PageInfo|null;charts?:ChartInfo[]}
let state:SheetsSelection|null=null;const listeners=new Set<()=>void>();
export const getSheetsSelection=()=>state;
export function setSheetsSelection(next:SheetsSelection|null){state=next;listeners.forEach(l=>l());}
export const useSheetsSelection=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},getSheetsSelection,getSheetsSelection);

export const subscribeSheets=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
