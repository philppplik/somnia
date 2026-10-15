import {useSyncExternalStore} from 'react';
import type {Rect} from './clipboard';
import type {TablesInfo,NameInfo,CellAnnotations,CellStyle,WorkbookInfo,SheetInfo,SheetLayout} from './protocol';
/** Selection shared between the grid canvas and the inspector. Session-only, never persisted. */
export interface SheetsSelection{file:string;sheet:number;sheetName:string;address:string;kind:string;text:string;formula:string|null;dirty:boolean;canUndo:boolean;canRedo:boolean;range?:Rect;workbook?:WorkbookInfo;info?:SheetInfo|null;layout?:SheetLayout|null;style?:CellStyle;revision?:number;listItems?:readonly string[]|null;annotations?:CellAnnotations|null;names?:readonly NameInfo[];tables?:TablesInfo|null}
let state:SheetsSelection|null=null;const listeners=new Set<()=>void>();
export const getSheetsSelection=()=>state;
export function setSheetsSelection(next:SheetsSelection|null){state=next;listeners.forEach(l=>l());}
export const useSheetsSelection=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},getSheetsSelection,getSheetsSelection);

export const subscribeSheets=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
