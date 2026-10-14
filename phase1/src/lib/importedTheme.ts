/** Persistent imported theme intent. Only validated variables reach the bounded stylesheet. */
import {parseThemeExchange,exportThemeExchange,themeExchangeVariables,ROLE_ALIASES,THEME_ROLES} from './themeExchange';
import type {ThemeExchange} from './themeExchange';
export const IMPORTED_THEME_KEY='somnia.importedTheme.v1';
const STYLE_ID='somnia-imported-theme';
export interface ImportedThemeState {theme:ThemeExchange|null;canUndo:boolean;persistent:boolean}
export function createImportedThemeStore(storage?:Pick<Storage,'getItem'|'setItem'|'removeItem'>){
 let theme:ThemeExchange|null=null;const history:(ThemeExchange|null)[]=[];let persistent=true;
 try{const raw=storage?.getItem(IMPORTED_THEME_KEY);if(raw){const parsed=parseThemeExchange(raw);if(parsed.ok)theme=parsed.theme;}}catch{persistent=false;}
 let state:ImportedThemeState={theme,canUndo:false,persistent};const listeners=new Set<()=>void>();
 const publish=()=>{try{if(storage){if(theme)storage.setItem(IMPORTED_THEME_KEY,exportThemeExchange(theme));else storage.removeItem(IMPORTED_THEME_KEY);persistent=true;}else persistent=false;}catch{persistent=false;}state={theme,canUndo:history.length>0,persistent};for(const fn of listeners)fn();};
 const set=(next:ThemeExchange|null)=>{const previous=theme;history.push(previous);if(history.length>20)history.shift();theme=next;publish();};
 return {getState:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},apply(next:ThemeExchange){const parsed=parseThemeExchange(exportThemeExchange(next));if(!parsed.ok)throw Error(parsed.error);set({...parsed.theme,ignored:[...next.ignored]});},reset(){if(theme)set(null);},undo(){if(!history.length)return;theme=history.pop()!;publish();}};
}
function storage(){try{return typeof localStorage==='undefined'?undefined:localStorage;}catch{return undefined;}}
export const importedThemeStore=createImportedThemeStore(storage());
/** Map only chrome roles. No legacy seed/radius/document/syntax variables. */
const APP_IMPORT_TARGETS:Partial<Record<keyof typeof ROLE_ALIASES,string>>={background:'--bg-base',foreground:'--text-primary',card:'--bg-panel',popover:'--bg-elevated',primary:'--accent-fill','primary-foreground':'--accent-ink',secondary:'--bg-surface',muted:'--bg-hover','muted-foreground':'--text-tertiary',destructive:'--danger',border:'--border-default',input:'--border-subtle',ring:'--focus-ring'};
export function importedThemeCss(theme:ThemeExchange|null):string {
 // Production aliases resolve existing roles even without an import. --sc-accent is hover, not --accent.
 const base=THEME_ROLES.map(role=>`--sc-${role}:var(${ROLE_ALIASES[role]});`).join('');
 if(!theme)return `:root{${base}}`;
 const modes=(['light','dark'] as const).map(mode=>{
  const colors=themeExchangeVariables(theme,mode);
  const aliases=Object.entries(colors).map(([key,value])=>`${key}:${value};`).join('');
  const targets=Object.entries(APP_IMPORT_TARGETS).filter(([role])=>theme[mode][role as keyof typeof ROLE_ALIASES]!==undefined).map(([role,target])=>`${target}:${theme[mode][role as keyof typeof ROLE_ALIASES]};`).join('');
  // Safety wins: aliases and effective application values revert to current high-contrast roles.
  return `:root[data-theme=${mode}]:not([data-contrast=high]){${aliases}${targets}}`;
 }).join('');
 return `:root{${base}}${modes}`;
}
export function applyImportedTheme(theme:ThemeExchange|null,doc:Document=document){
 let element=doc.getElementById(STYLE_ID) as HTMLStyleElement|null;
 if(!element){element=doc.createElement('style');element.id=STYLE_ID;doc.head.append(element);}
 element.textContent=importedThemeCss(theme);
}
/** Startup install plus updates. Native/OS mode is selected by existing root attributes. */
export function installImportedTheme(doc:Document=document){applyImportedTheme(importedThemeStore.getState().theme,doc);return importedThemeStore.subscribe(()=>applyImportedTheme(importedThemeStore.getState().theme,doc));}
/** Preview fallback is explicitly scheme-local, never inherited from the current app. */
export function importedThemePreview(theme:ThemeExchange,mode:'light'|'dark'):Record<string,string>{
 const fallback=mode==='light'?{'--sc-background':'#f4f4f8','--sc-foreground':'#18181b','--sc-card':'#fff','--sc-card-foreground':'#18181b','--sc-border':'#cccdd7','--sc-primary':'#4f46e5','--sc-primary-foreground':'#fff'}:{'--sc-background':'#0e0e10','--sc-foreground':'#fafafa','--sc-card':'#131316','--sc-card-foreground':'#fafafa','--sc-border':'#3a3a42','--sc-primary':'#6366f1','--sc-primary-foreground':'#fff'};
 return {...fallback,...themeExchangeVariables(theme,mode)};
}
