/**
 * M2: installs the macOS native menu mirror (concept 4.2 + D10 recommendation).
 * Lives in components/ because it reads the app store; the pure tree builder is
 * src/lib/shell/nativeMenu.ts (unit-tested). No-op outside Tauri macOS.
 * Rebuilds are debounced (200ms) and skipped while the serialized tree is unchanged.
 * Items carry no accelerators on purpose: the webview shortcut dispatcher stays the only
 * keyboard path, so a shortcut never fires twice. Clicks route through
 * executeNativeMenuCommand -> executeCommand, which re-checks availability.
 */
import {isTauri} from '@tauri-apps/api/core';
import {commandEnabled,executeNativeMenuCommand,isMac,listCommands} from '../../lib/commands';
import {t} from '../../lib/i18n';
import {buildLegacyMenuModel,buildMenuModel} from '../../lib/shell/menuModel';
import {toNativeTree,type NativeEntry,type NativeMenuTree,type NativeViewMode} from '../../lib/shell/nativeMenu';
import {getStudio} from '../../lib/studios';
import {resolveStudioMode,studioModes} from '../../lib/studios/modes';
import {getUiContext,subscribeUiContext} from '../../lib/uiContextStore';
import {getState,studioDocumentKey,subscribe} from '../../store/appStore';

/** Resolved view modes as native check items, same selection logic as StudioViewMenu. */
function currentNativeViewModes():NativeViewMode[]{
 const state=getState();const studio=getStudio(state.activeStudio);const modes=studioModes(studio);
 if(!modes.length)return [];
 const commands=listCommands();
 const selected=modes.find(mode=>mode.viewMode===state.viewMode)??resolveStudioMode(studio,state.studioModeByDocument,studioDocumentKey());
 const native=['raster','vector','pdf'].includes(getUiContext().domain);
 return modes.map(mode=>{const command=commands.find(c=>c.id===mode.command);return {command:mode.command,label:t(mode.label),checked:selected?.id===mode.id,enabled:!native&&!!command&&commandEnabled(command)};});
}
function currentNativeTree():NativeMenuTree{
 const commands=listCommands();const studioId=getState().activeStudio;
 const model=buildMenuModel(studioId,commands)??buildLegacyMenuModel(studioId,commands);
 return toNativeTree(model,{appName:'Somnia',domain:getUiContext().domain,viewModes:currentNativeViewModes()});
}
const nativeEntry=(e:NativeEntry)=>{
 switch(e.kind){
  case 'separator':return {item:'Separator' as const};
  case 'predefined':return e.item==='About'?{item:{About:null}}:{item:e.item};
  case 'check':return {id:e.id,text:e.text,checked:e.checked,enabled:e.enabled,action:(id:string)=>{void executeNativeMenuCommand(id);}};
  default:return {id:e.id,text:e.text,enabled:e.enabled,action:(id:string)=>{void executeNativeMenuCommand(id);}};
 }
};
export async function installNativeMenuMirror():Promise<()=>void>{
 if(!isTauri()||!isMac())return ()=>{};
 const {Menu}=await import('@tauri-apps/api/menu');
 let disposed=false;let timer:ReturnType<typeof setTimeout>|undefined;let lastKey='';
 const build=async()=>{
  if(disposed)return;
  const tree=currentNativeTree();
  const key=JSON.stringify(tree);
  if(key===lastKey)return;
  lastKey=key;
  const menu=await Menu.new({items:[
   {id:'somnia.app',text:tree.app.text,enabled:tree.app.enabled,items:tree.app.items.map(nativeEntry)},
   ...tree.menus.map(m=>({id:`somnia.menu.${m.text}`,text:t('menu.'+m.text),enabled:m.enabled,items:m.items.map(nativeEntry)})),
  ]});
  if(disposed)return;
  await menu.setAsAppMenu();
 };
 const schedule=()=>{if(timer!==undefined)return;timer=setTimeout(()=>{timer=undefined;void build().catch(e=>console.error('native menu rebuild failed',e));},200);};
 const offA=subscribe(schedule);const offB=subscribeUiContext(schedule);
 schedule();
 return()=>{disposed=true;if(timer!==undefined)clearTimeout(timer);offA();offB();};
}
