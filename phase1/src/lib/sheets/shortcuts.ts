import {useSyncExternalStore} from 'react';
/** The keyboard surface the grid really handles, one source for the cheatsheet dialog. `Mod` is Ctrl, or Command on a Mac. */
export interface SheetsShortcut{combo:string;labelKey:string}
export interface SheetsShortcutGroup{id:'nav'|'edit'|'format'|'view';entries:readonly SheetsShortcut[]}
export const SHEETS_SHORTCUT_GROUPS:readonly SheetsShortcutGroup[]=[
 {id:'nav',entries:[
  {combo:'←↑→↓',labelKey:'sheets.sc.move'},{combo:'Shift+←↑→↓',labelKey:'sheets.sc.extend'},{combo:'Tab',labelKey:'sheets.sc.next'},{combo:'Shift+Tab',labelKey:'sheets.sc.previous'},{combo:'Mod+A',labelKey:'sheets.sc.selectAll'}]},
 {id:'edit',entries:[
  {combo:'Enter / F2',labelKey:'sheets.sc.edit'},{combo:'A-Z, 0-9',labelKey:'sheets.sc.type'},{combo:'Del / Backspace',labelKey:'sheets.sc.clear'},{combo:'Space',labelKey:'sheets.sc.checkbox'},
  {combo:'Mod+C',labelKey:'sheets.sc.copy'},{combo:'Mod+X',labelKey:'sheets.sc.cut'},{combo:'Mod+V',labelKey:'sheets.sc.paste'},{combo:'Mod+Z',labelKey:'sheets.sc.undo'},{combo:'Mod+Y / Mod+Shift+Z',labelKey:'sheets.sc.redo'}]},
 {id:'format',entries:[
  {combo:'Mod+B',labelKey:'sheets.sc.bold'},{combo:'Mod+I',labelKey:'sheets.sc.italic'},{combo:'Mod+U',labelKey:'sheets.sc.underline'},{combo:'Mod+Shift+%',labelKey:'sheets.sc.percent'}]},
 {id:'view',entries:[
  {combo:'Mod+`',labelKey:'sheets.sc.formulas'},{combo:'Mod+/',labelKey:'sheets.sc.cheatsheet'}]},
];
export const formatSheetsShortcut=(combo:string,mac:boolean)=>combo.replace(/Mod\+/g,mac?'⌘+':'Ctrl+');
/** Open state of the cheatsheet dialog (not persisted). */
let open=false;const subs=new Set<()=>void>();
export const setSheetsShortcutsOpen=(next:boolean)=>{if(open===next)return;open=next;subs.forEach(f=>f());};
export const useSheetsShortcutsOpen=()=>useSyncExternalStore(f=>{subs.add(f);return()=>{subs.delete(f);};},()=>open,()=>false);
