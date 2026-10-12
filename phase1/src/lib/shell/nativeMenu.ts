/**
 * M2: Tauri native menu generated from the same menu model as the in-app MenuBar.
 *
 * `toNativeTree` is pure and unit-tested; the installer lives in src/lib/desktopAdapter.ts
 * (layering: src/lib must not import src/store). Scope decisions (concept D10 recommendation):
 * mirror on macOS, where the OS owns the menu bar; Windows and Linux keep the in-app menus in
 * the custom titlebar, so nothing changes there. Items carry no accelerators on purpose:
 * keyboard shortcuts stay dispatched by the webview's attachKeyboardShortcuts, so a shortcut
 * can never fire twice (native item + webview handler). Clicks route through
 * executeNativeMenuCommand -> executeCommand, which re-checks availability.
 */
import type {MenuModel} from './menuModel';
import type {MenuId} from './types';

export type NativeEntry=
 |{kind:'item';id:string;text:string;enabled:boolean}
 |{kind:'check';id:string;text:string;checked:boolean;enabled:boolean}
 |{kind:'predefined';item:'About'|'Quit'|'Cut'|'Copy'|'Paste'|'SelectAll'}
 |{kind:'separator'};
export interface NativeSubmenu{text:string;enabled:boolean;items:NativeEntry[]}
export interface NativeMenuTree{app:NativeSubmenu;menus:NativeSubmenu[]}
export interface NativeViewMode{command:string;label:string;checked:boolean;enabled:boolean}

/** Insert items are disabled outside the web domain, same rule as the in-app menu. */
const entryEnabled=(menu:MenuId,domain:string,e:{enabled:boolean})=>e.enabled&&!(menu==='Insert'&&domain!=='web');

/** Pure: resolved model + view modes + domain -> native tree. The macOS app menu keeps Quit/About. */
export function toNativeTree(model:MenuModel[],opts:{appName:string;domain:string;viewModes:readonly NativeViewMode[]}):NativeMenuTree{
 const app:NativeSubmenu={text:opts.appName,enabled:true,items:[{kind:'predefined',item:'About'},{kind:'separator'},{kind:'predefined',item:'Quit'}]};
 const menus=model.map(m=>{
  const items:NativeEntry[]=[];
  if(m.viewModes){
   for(const v of opts.viewModes)items.push({kind:'check',id:v.command,text:v.label,checked:v.checked,enabled:v.enabled});
   if(opts.viewModes.length)items.push({kind:'separator'});
  }
  for(const e of m.entries)items.push('separator' in e?{kind:'separator'}:{kind:'item',id:e.id,text:e.title,enabled:entryEnabled(m.menu,opts.domain,e)});
  // The default macOS menu carried the clipboard roles the webview needs; replacing the menu must keep them.
  if(m.menu==='Edit')items.push({kind:'separator'},{kind:'predefined',item:'Cut'},{kind:'predefined',item:'Copy'},{kind:'predefined',item:'Paste'},{kind:'predefined',item:'SelectAll'});
  return {text:m.menu,enabled:!m.disabled,items};
 });
 return {app,menus};
}

