import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow,LogicalSize} from '@tauri-apps/api/window';
export interface WindowPrefs{remember:boolean;width:number;height:number;alwaysOnTop:boolean;frame:'custom'|'system';doubleClick:'maximize'|'none'}
export const DEFAULT_WINDOW_PREFS:WindowPrefs={remember:true,width:1440,height:900,alwaysOnTop:false,frame:'custom',doubleClick:'maximize'};
export function sanitizeWindowPrefs(x:any):WindowPrefs{const n=(v:unknown,min:number,max:number,d:number)=>typeof v==='number'&&Number.isFinite(v)?Math.round(Math.max(min,Math.min(max,v))):d;return {remember:x?.remember!==false,width:n(x?.width,960,3840,1440),height:n(x?.height,600,2160,900),alwaysOnTop:x?.alwaysOnTop===true,frame:x?.frame==='system'?'system':'custom',doubleClick:x?.doubleClick==='none'?'none':'maximize'};}
export function readWindowPrefs():WindowPrefs{try{return sanitizeWindowPrefs(JSON.parse(localStorage.getItem('somnia.windowPrefs.v1')||'{}'));}catch{return {...DEFAULT_WINDOW_PREFS};}}
export function saveWindowPrefs(p:WindowPrefs){try{localStorage.setItem('somnia.windowPrefs.v1',JSON.stringify(p));if(!p.remember)localStorage.removeItem('somnia.window.v1');}catch{/* session only */}}
export interface WindowPort{setAlwaysOnTop:(value:boolean)=>Promise<void>;setDecorations:(value:boolean)=>Promise<void>;setSize:(value:LogicalSize)=>Promise<void>}
/** Apply only after platform accepts; callers commit the preference on success. */
export async function applyWindowPrefs(next:WindowPrefs,old:WindowPrefs,port?:WindowPort){if(!port&&!isTauri())return;const win=port??getCurrentWindow();if(next.alwaysOnTop!==old.alwaysOnTop)await win.setAlwaysOnTop(next.alwaysOnTop);if(next.frame!==old.frame)await win.setDecorations(next.frame==='system');if(next.width!==old.width||next.height!==old.height)await win.setSize(new LogicalSize(next.width,next.height));}
