import {downloadProject} from './exportProject';
import { applyHistory, getState, patchState } from '../store/appStore';
export interface Command {id:string;title:string;category:'Project'|'Edit'|'View'|'Help';shortcut?:string;keywords?:string[];allowInInput?:boolean;enabled?:()=>boolean;run:(payload?:unknown)=>void|Promise<void>}
const registry=new Map<string,Command>();
export const registerCommand=(command:Command)=>{registry.set(command.id,command);return()=>{if(registry.get(command.id)===command)registry.delete(command.id);};};
export const listCommands=()=>[...registry.values()];
export const commandEnabled=(command:Command)=>command.enabled?.()??true;
export async function executeCommand(id:string,payload?:unknown){
 const command=registry.get(id);if(!command)throw new Error(`Unknown command: ${id}`);
 if(!commandEnabled(command)){patchState({notice:`${command.title} is unavailable until its service is connected.`});return false;}
 try{await command.run(payload);patchState({recentCommands:[id,...getState().recentCommands.filter(c=>c!==id)].slice(0,5)});return true;}
 catch(error){patchState({notice:error instanceof Error?error.message:'Command failed.'});return false;}
}
/** Wire Tauri menu IDs directly to this function. Never run project JS or add a privileged iframe bridge. */
export const executeNativeMenuCommand=executeCommand;
const ui=(id:string,title:string,shortcut:string|undefined,run:()=>void)=>registerCommand({id,title,category:'View',shortcut,run});
ui('palette.open','Command palette','Mod+K',()=>patchState({paletteOpen:true}));
ui('sidebar.toggle','Toggle sidebar','Mod+B',()=>patchState({sidebarOpen:!getState().sidebarOpen}));
ui('inspector.toggle','Toggle inspector','Mod+Alt+I',()=>patchState({inspectorOpen:!getState().inspectorOpen}));
ui('problems.toggle','Toggle problems','Mod+J',()=>patchState({problemsOpen:!getState().problemsOpen}));
ui('view.code','Code view','Mod+1',()=>patchState({viewMode:'code'}));
ui('view.design','Design view','Mod+2',()=>patchState({viewMode:'design'}));
ui('view.split','Split view','Mod+3',()=>patchState({viewMode:'split'}));
ui('zoom.in','Zoom in','Mod+=',()=>patchState({zoom:Math.min(200,getState().zoom+10)}));
ui('zoom.out','Zoom out','Mod+-',()=>patchState({zoom:Math.max(25,getState().zoom-10)}));
ui('zoom.reset','Actual size','Mod+0',()=>patchState({zoom:100}));
ui('theme.light','Use light theme',undefined,()=>patchState({theme:'light'}));
ui('theme.dark','Use dark theme',undefined,()=>patchState({theme:'dark'}));
ui('theme.toggle','Toggle light / dark theme',undefined,()=>patchState({theme:getState().theme==='dark'?'light':'dark'}));
for(const direction of ['undo','redo'] as const)registerCommand({id:`edit.${direction}`,title:direction==='undo'?'Undo':'Redo',category:'Edit',shortcut:direction==='undo'?'Mod+Z':'Mod+Shift+Z',enabled:()=>getState().coreConnected,run:()=>applyHistory(direction)});
for(const [id,title,shortcut] of [['project.open','Open folder','Mod+O'],['project.save','Save project','Mod+S'],['project.export','Export HTML',undefined]] as const)registerCommand({id,title,category:'Project',shortcut,allowInInput:id==='project.save',enabled:()=>false,run:()=>{}});
registerCommand({id:'help.shortcuts',title:'Keyboard shortcuts',category:'Help',keywords:['help','keyboard'],run:()=>patchState({notice:'Ctrl/Cmd+K commands · B sidebar · J problems · 1/2/3 views · Z undo · Shift+Z redo. Resize panels with arrow keys.'})});
export const isMac=()=>/Mac|iPhone|iPad/.test(navigator.platform);
export const formatShortcut=(shortcut:string)=>shortcut.split('+').map(part=>({Mod:isMac()?'⌘':'Ctrl',Alt:isMac()?'⌥':'Alt',Shift:isMac()?'⇧':'Shift'}[part]??part)).join(isMac()?'':' + ');
export function matchesShortcut(event:KeyboardEvent,shortcut:string){
 const parts=shortcut.toLowerCase().split('+');const key=parts.pop();const modifier=isMac()?event.metaKey:event.ctrlKey;
 return event.key.toLowerCase()===key&&modifier===parts.includes('mod')&&event.altKey===parts.includes('alt')&&event.shiftKey===parts.includes('shift')&&(isMac()?!event.ctrlKey:!event.metaKey);
}
export function attachKeyboardShortcuts(target:Window=window){
 const listener=(event:KeyboardEvent)=>{
  if(event.defaultPrevented||event.isComposing||event.repeat)return;
  const element=event.target;const input=element instanceof HTMLElement&&!!element.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]');
  if(getState().paletteOpen)return;
  let command=listCommands().find(c=>c.shortcut&&matchesShortcut(event,c.shortcut));
  if(!isMac()&&matchesShortcut(event,'Mod+Y'))command=registry.get('edit.redo');
  const coreEditor=element instanceof HTMLElement&&element.matches('[data-core-editor]');
  if(!command||(input&&!command.allowInInput&&command.id!=='palette.open'&&!(coreEditor&&command.id.startsWith('edit.'))))return;
  event.preventDefault();void executeCommand(command.id);
 };
 target.addEventListener('keydown',listener);return()=>target.removeEventListener('keydown',listener);
}

registerCommand({id:'project.export',title:'Export source ZIP',category:'Project',enabled:()=>getState().coreConnected,run:()=>{downloadProject(getState().files,getState().projectName);patchState({notice:'Source ZIP download requested. Local disk save state is unchanged.'});}});
