import {listStudios,getStudio} from './studios';
import {studioModes} from './studios/modes';
import {getUiContext} from './uiContextStore';
import {requestStudio} from '../store/appStore';
import {copyErrorReport} from './log';
import {t,tOr} from './i18n';
import {openExternal,REPO_URL} from './openExternal';
import {formatCode,langFor} from './format';
import {getActiveEditor,transformSelection} from './editorBridge';
import {encodeEntities,decodeEntities} from './entities';
import {newBlankFile,openFileDialog,openMediaDialog} from './projectActions';
import {downloadProject,downloadMarkdown} from './exportProject';
import {elements,insertElement} from './structureCommands';
import { applyHistory, getState, patchState } from '../store/appStore';
import { EditorProject } from '@somnia/editor-core';
import {getChatSession} from './collab/chatSession';
import {toggleSessionChat} from './collab/communication';
/** Experimental fast parsing (partial reparse). On by default; the stored choice 'off' turns it off for good, a full parse is always the fallback. */
const FAST_KEY='somnia.fastParse.v1';
try{if(localStorage.getItem(FAST_KEY)==='off')EditorProject.incremental.enabled=false;}catch{/* storage unavailable */}
export interface Command {id:string;title:string;category:'Project'|'Edit'|'View'|'Insert'|'Tools'|'Help';shortcut?:string;keywords?:string[];allowInInput?:boolean;enabled?:()=>boolean;run:(payload?:unknown)=>void|Promise<void>}
const registry=new Map<string,Command>();
const scopes=new Set<(id:string)=>Command|undefined>();
/** Editors can route shared Save/Undo/Close without replacing the project's registrations. */
export function registerCommandScope(resolve:(id:string)=>Command|undefined){scopes.add(resolve);return()=>{scopes.delete(resolve);};}
const scoped=(id:string)=>[...scopes].reverse().map(resolve=>resolve(id)).find(Boolean);

export const registerCommand=(command:Command)=>{registry.set(command.id,command);return()=>{if(registry.get(command.id)===command)registry.delete(command.id);};};
const SC_KEY='somnia.shortcuts.v1';
/** User overrides: command id -> shortcut string, '' = disabled. Defaults live on the commands. */
export function shortcutOverrides():Record<string,string>{try{const v=JSON.parse(localStorage.getItem(SC_KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).filter(([,x])=>typeof x==='string')) as Record<string,string>:{};}catch{return{};}}
export function setShortcutOverride(id:string,shortcut:string|null){const o=shortcutOverrides();if(shortcut===null)delete o[id];else o[id]=shortcut;localStorage.setItem(SC_KEY,JSON.stringify(o));window.dispatchEvent(new Event('somnia:shortcuts-changed'));}
export const defaultShortcut=(id:string)=>registry.get(id)?.shortcut;
export const listCommands=()=>{const o=shortcutOverrides();return [...registry.values()].map(c=>{const override=scoped(c.id);const t=override??{...c,title:tOr(`cmd.${c.id}`,c.title)};return id_in(o,c.id)?{...t,shortcut:o[c.id]||undefined}:t;});};
const id_in=(o:Record<string,string>,id:string)=>Object.prototype.hasOwnProperty.call(o,id);
/** Turns a keydown into a shortcut string like Mod+Shift+K, or null for bare modifier presses. */
export function shortcutFromEvent(e:KeyboardEvent):string|null{
 if(['Control','Shift','Alt','Meta'].includes(e.key))return null;
 const mod=(isMac()?e.metaKey:e.ctrlKey);const key=e.key.length===1?e.key.toLowerCase():e.key;
 return [mod?'Mod':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',key===' '?'Space':key].filter(Boolean).join('+');}
export const commandEnabled=(command:Command)=>(scoped(command.id)??command).enabled?.()??true;
export async function executeCommand(id:string,payload?:unknown){
 const command=scoped(id)??registry.get(id);if(!command)throw new Error(`Unknown command: ${id}`);
 if(!commandEnabled(command)){patchState({notice:`${command.title} is unavailable until its service is connected.`});return false;}
 try{await command.run(payload);patchState({recentCommands:[id,...getState().recentCommands.filter(c=>c!==id)].slice(0,5)});return true;}
 catch(error){patchState({notice:error instanceof Error?error.message:'Command failed.'});return false;}
}
/** Wire Tauri menu IDs directly to this function. Never run project JS or add a privileged iframe bridge. */
export const executeNativeMenuCommand=executeCommand;
const ui=(id:string,title:string,shortcut:string|undefined,run:()=>void)=>registerCommand({id,title,category:'View',shortcut,run});
ui('palette.open','Command palette','Mod+K',()=>patchState({paletteOpen:true}));
ui('search.project','Search in project','Mod+Shift+F',()=>patchState({leftTab:'search',sidebarOpen:true}));
ui('css.open','CSS variables and classes',undefined,()=>patchState({leftTab:'css',sidebarOpen:true}));
ui('sidebar.toggle','Toggle sidebar','Mod+B',()=>patchState({sidebarOpen:!getState().sidebarOpen}));
ui('agent.toggle','Toggle Somnia Agent','Mod+Alt+A',()=>patchState({agentOpen:!getState().agentOpen}));
registerCommand({id:'chat.toggle',title:'Toggle session chat',category:'View',shortcut:'Mod+Alt+C',allowInInput:true,enabled:()=>!!getChatSession(),run:()=>toggleSessionChat()});
ui('inspector.toggle','Toggle inspector','Mod+Alt+I',()=>patchState({inspectorOpen:!getState().inspectorOpen}));
ui('problems.toggle','Toggle problems','Mod+J',()=>patchState({problemsOpen:!getState().problemsOpen}));
const canUseCodeMode=(mode:string)=>studioModes(getStudio(getState().activeStudio)).some(m=>m.command==='view.'+mode)&&!['raster','vector','pdf'].includes(getUiContext().domain);
for(const [mode,title,key] of [['code','Code',3],['design','Design',1],['split','Split',2]] as const)registerCommand({id:'view.'+mode,title:title+' view',category:'View',shortcut:'Mod+Alt+'+key,enabled:()=>canUseCodeMode(mode),run:()=>patchState({viewMode:mode})});
for(const [index,studio] of listStudios().entries())registerCommand({id:'studio.'+studio.id,title:'Switch to '+studio.id+' Studio',category:'View',shortcut:index<9?'Mod+'+(index+1):undefined,allowInInput:true,run:()=>{requestStudio(studio.id);}});
registerCommand({id:'split.vertical',title:'Split: code and design side by side',category:'View',enabled:()=>canUseCodeMode('split'),run:()=>patchState({viewMode:'split',splitLayout:'vertical'})});
registerCommand({id:'split.horizontal',title:'Split: code above, design below',category:'View',enabled:()=>canUseCodeMode('split'),run:()=>patchState({viewMode:'split',splitLayout:'horizontal'})});
registerCommand({id:'split.swap',title:'Split: swap code and design',category:'View',enabled:()=>canUseCodeMode('split'),run:()=>patchState({viewMode:'split',splitSwap:!getState().splitSwap})});
ui('zoom.in','Zoom in','Mod+=',()=>patchState({zoom:Math.min(200,getState().zoom+10)}));
ui('zoom.out','Zoom out','Mod+-',()=>patchState({zoom:Math.max(25,getState().zoom-10)}));
ui('zoom.reset','Actual size','Mod+0',()=>patchState({zoom:100}));
ui('theme.light','Use light theme',undefined,()=>patchState({themeChoice:'light',theme:'light'}));
ui('theme.dark','Use dark theme',undefined,()=>patchState({themeChoice:'dark',theme:'dark'}));
ui('theme.toggle','Toggle light / dark theme',undefined,()=>{const t=getState().theme==='dark'?'light':'dark';patchState({themeChoice:t,theme:t});});
for(const direction of ['undo','redo'] as const)registerCommand({id:`edit.${direction}`,title:direction==='undo'?'Undo':'Redo',category:'Edit',shortcut:direction==='undo'?'Mod+Z':'Mod+Shift+Z',enabled:()=>getState().coreConnected,run:()=>applyHistory(direction)});
for(const [id,title,shortcut] of [['project.open','Open folder','Mod+O'],['project.save','Save project','Mod+S']] as const)registerCommand({id,title,category:'Project',shortcut,allowInInput:id==='project.save',enabled:()=>false,run:()=>{}});
registerCommand({id:'help.errorReport',title:'Copy error report (log excerpt and version)',category:'Help',keywords:['help','error','log','bug','report','copy','diagnostics'],run:async()=>{await copyErrorReport();}});
registerCommand({id:'help.github',title:'Somnia on GitHub (source, releases, issues)',category:'Help',keywords:['help','github','repo','source','issues','releases'],run:()=>{void openExternal(REPO_URL).catch(()=>patchState({notice:'Could not open the browser. The page is '+REPO_URL}));}});
registerCommand({id:'help.shortcuts',title:'Keyboard shortcuts',category:'Help',keywords:['help','keyboard'],run:()=>patchState({settingsOpen:true,settingsSection:'Shortcuts',settingsNavigationId:getState().settingsNavigationId+1})});
export const isMac=()=>/Mac|iPhone|iPad/.test(navigator.platform);
export const formatShortcut=(shortcut:string)=>shortcut.split('+').map(part=>({Mod:isMac()?'⌘':'Ctrl',Alt:isMac()?'⌥':'Alt',Shift:isMac()?'⇧':'Shift'}[part]??(part.length===1?part.toUpperCase():part))).join(isMac()?'':' + ');
elements.forEach((element,i)=>registerCommand({id:`insert.element.${i}`,title:element.label,category:'Insert',keywords:['insert','add','element',element.label.toLowerCase()],enabled:()=>getState().coreConnected,run:()=>insertElement(i)}));
registerCommand({id:'view.livePreview',title:'Toggle live preview',category:'View',keywords:['preview','run','scripts','browser'],enabled:()=>getState().coreConnected,run:()=>{const st=getState();patchState({livePreview:!st.livePreview,...(st.viewMode==='code'?{viewMode:'split' as const}:{})});}});
registerCommand({id:'view.toggleCodeDesign',title:'Toggle code / design view',category:'View',shortcut:'Mod+`',keywords:['dreamweaver','switch'],run:()=>patchState({viewMode:getState().viewMode==='code'?'design':'code'})});
registerCommand({id:'panels.hideAll',title:'Hide / show all panels',category:'View',shortcut:'F4',keywords:['dreamweaver','panels'],run:()=>{const s=getState();const anyOpen=s.sidebarOpen||s.inspectorOpen||s.problemsOpen;patchState({sidebarOpen:!anyOpen,inspectorOpen:!anyOpen,problemsOpen:false});}});
const sel=()=>getState().coreConnected&&!!getState().selectedElementId;
registerCommand({id:'edit.duplicate',title:'Duplicate selected element',category:'Edit',shortcut:'Mod+D',enabled:sel,run:async()=>{(await import('./structureCommands')).duplicateLayer(getState().selectedElementId!);}});
registerCommand({id:'edit.delete',title:'Delete selected element',category:'Edit',shortcut:'Delete',enabled:sel,run:async()=>{(await import('./structureCommands')).deleteLayer(getState().selectedElementId!);}});
registerCommand({id:'tab.close',title:'Close current tab',category:'View',shortcut:'Mod+W',enabled:()=>getState().openFiles.length>1,run:async()=>{(await import('../store/appStore')).closeFileTab(getState().activeFile);}});
const cycleTab=async(step:number)=>{const {openFiles,activeFile}=getState();if(openFiles.length<2)return;(await import('../store/appStore')).openFileTab(openFiles[(openFiles.indexOf(activeFile)+step+openFiles.length)%openFiles.length]);};
registerCommand({id:'tab.next',title:'Next tab',category:'View',shortcut:'Mod+Alt+ArrowRight',run:()=>cycleTab(1)});
registerCommand({id:'tab.prev',title:'Previous tab',category:'View',shortcut:'Mod+Alt+ArrowLeft',run:()=>cycleTab(-1)});
export function matchesShortcut(event:KeyboardEvent,shortcut:string){
 const parts=shortcut.toLowerCase().split('+');const key=parts.pop();const modifier=isMac()?event.metaKey:event.ctrlKey;
 return event.key.toLowerCase()===key&&modifier===parts.includes('mod')&&event.altKey===parts.includes('alt')&&event.shiftKey===parts.includes('shift')&&(isMac()?!event.ctrlKey:!event.metaKey);
}
export function attachKeyboardShortcuts(target:Window=window){
 const listener=(event:KeyboardEvent)=>{
  if(event.defaultPrevented||event.isComposing||event.repeat)return;
  const element=event.target;const input=element instanceof HTMLElement&&!!element.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]');
  if(getState().paletteOpen||getState().settingsOpen)return;
  const list=listCommands();const mdFocus=element instanceof HTMLElement&&element.matches('[data-core-editor]')&&/\.(md|markdown)$/i.test(getState().activeFile);
  const matches=list.filter(c=>!c.id.startsWith('md.')&&c.shortcut&&matchesShortcut(event,c.shortcut));
  if(matches.length>1){event.preventDefault();patchState({notice:t('studio.shortcutConflict',{commands:matches.map(c=>c.title).join(', ')})});return;}
  let command:Command|undefined=matches[0];
  if(!isMac()&&matchesShortcut(event,'Mod+Y'))command=list.find(c=>c.id==='edit.redo');
  const coreEditor=element instanceof HTMLElement&&element.matches('[data-core-editor]');
  const mdEditor=coreEditor&&/\.(md|markdown)$/i.test(getState().activeFile);
  if(!command||(input&&!command.allowInInput&&command.id!=='palette.open'&&!(coreEditor&&command.id.startsWith('edit.'))&&!(mdEditor&&command.id.startsWith('view.'))))return;
  event.preventDefault();void executeCommand(command.id);
 };
 // Markdown editor commands (Mod+B, Mod+I, ...) run in the capture phase so they beat the editor's own keymap (Mod+I selects the parent syntax node) and the global sidebar toggle. They never fire outside the Markdown editor, so Mod+B stays the sidebar toggle there.
 const mdListener=(event:KeyboardEvent)=>{
  if(event.defaultPrevented||event.isComposing||event.repeat)return;const el=event.target;
  if(!(el instanceof HTMLElement&&el.matches('[data-core-editor]')&&/\.(md|markdown)$/i.test(getState().activeFile)))return;
  if(getState().paletteOpen||getState().settingsOpen)return;
  const mc=listCommands().find(c=>c.id.startsWith('md.')&&c.shortcut&&matchesShortcut(event,c.shortcut));
  if(mc&&commandEnabled(mc)){event.preventDefault();event.stopPropagation();void executeCommand(mc.id);}};
 target.addEventListener('keydown',mdListener,true);
 target.addEventListener('keydown',listener);return()=>{target.removeEventListener('keydown',listener);target.removeEventListener('keydown',mdListener,true);};
}

registerCommand({id:'tools.diff',title:'Toggle diff split (compare in editor)',category:'Tools',keywords:['diff','compare','changes','saved version'],enabled:()=>getState().coreConnected,run:()=>{const st=getState();patchState({diffSplit:!st.diffSplit,...(st.viewMode==='design'?{viewMode:'split' as const}:{})});}});
registerCommand({id:'tools.editImage',title:'Edit image...',category:'Tools',keywords:['image','edit','crop','resize','rotate','flip','brightness','contrast','photo'],run:()=>{window.dispatchEvent(new Event('somnia:edit-image'));}});
registerCommand({id:'tools.convert',title:'Convert files...',category:'Tools',keywords:['convert','format','image','png','jpg','webp','svg','pdf','docx','markdown','html','csv','json','batch'],run:()=>patchState({convertDialog:true})});
registerCommand({id:'project.export',title:'Export project...',category:'Project',keywords:['zip','folder','single file','download'],enabled:()=>getState().coreConnected,run:()=>patchState({exportDialog:true})});
registerCommand({id:'experimental.fastParse',title:'Experimental: toggle fast parsing',category:'Tools',keywords:['incremental','parse','performance','experimental'],run:()=>{const on=!EditorProject.incremental.enabled;EditorProject.incremental.enabled=on;try{localStorage.setItem(FAST_KEY,on?'on':'off');}catch{/* storage unavailable */}patchState({notice:on?'Fast parsing is on (experimental). Unsure cases still use the full parser.':'Fast parsing is off. Every edit uses the full parser.'});}});
registerCommand({id:'project.openFile',title:'Open file',category:'Project',keywords:['open','file'],run:()=>openFileDialog()});
registerCommand({id:'project.openMedia',title:'Open image or PDF to preview',category:'Project',keywords:['png','jpg','jpeg','pdf','image','preview','media'],run:()=>openMediaDialog()});
registerCommand({id:'project.newFile',title:'New blank page',category:'Project',keywords:['new','blank','file'],run:()=>newBlankFile()});

ui('settings.open','Settings','Mod+,',()=>patchState({settingsOpen:true}));
ui('extensions.open','Extensions',undefined,()=>patchState({settingsOpen:true,settingsSection:'Extensions'}));

registerCommand({id:'project.export.md',title:'Export active file as Markdown',category:'Project',keywords:['md','markdown'],enabled:()=>getState().coreConnected&&/\.html?$/i.test(getState().activeFile),run:()=>{try{downloadMarkdown(getState().files,getState().activeFile);patchState({notice:'Markdown download requested. The source file is unchanged.'});}catch(error){patchState({notice:error instanceof Error?error.message:'Markdown export failed.'});}}});
/** Tools menu groups app-level utilities; registered after all commands exist. */
for(const id of ['settings.open','problems.toggle','theme.toggle','palette.open']){const c=registry.get(id);if(c)c.category='Tools';}

for(const [id,title,fn] of [['edit.encodeEntities','Encode special characters (HTML entities)',encodeEntities],['edit.decodeEntities','Decode special characters (HTML entities)',decodeEntities]] as const)registerCommand({id,title,category:'Edit',keywords:['html','entities','escape','unescape','special characters'],run:()=>{const v=getActiveEditor();if(!v||!transformSelection(v,fn))patchState({notice:'Select text in the code editor first.'});else v.focus();}});

/** Apply formatting to the selection, or to the whole file when nothing is selected. */
export async function applyFormatting(){const v=getActiveEditor();const file=getState().activeFile;const lang=langFor(file);
 if(!v||!lang){patchState({notice:'Open an HTML, CSS or JavaScript file in the code editor to format it.'});return;}
 const r=v.state.selection.main;const whole=r.empty;const from=whole?0:r.from,to=whole?v.state.doc.length:r.to;const src=v.state.sliceDoc(from,to);
 try{const out=await formatCode(src,lang);const text=whole?out:out.replace(/\n$/,'');if(text===src){patchState({notice:'Already formatted.'});return;}
  v.dispatch({changes:{from,to,insert:text},selection:{anchor:Math.min(from,from+text.length)}});v.focus();patchState({notice:whole?'Formatted the file.':'Formatted the selection.'});}
 catch(e){patchState({notice:`Could not format: ${(e instanceof Error?e.message:String(e)).split('\n')[0]}`});}}
registerCommand({id:'edit.format',title:'Apply formatting',category:'Edit',shortcut:'Alt+Shift+F',allowInInput:true,keywords:['format','prettier','indent','beautify'],run:()=>applyFormatting()});

const inTable=()=>getState().coreConnected&&!!getState().selectedElementId;
registerCommand({id:'table.insert',title:'Insert table (3 x 3, header row, caption)',category:'Insert',keywords:['table','grid','rows','columns'],enabled:()=>getState().coreConnected,run:async()=>{(await import('./tableCommands')).insertTable(3,3);}});
for(const [id,title,act] of [['row.above','Table: add row above','row.above'],['row.below','Table: add row below','row.below'],['row.delete','Table: delete row','row.delete'],['col.left','Table: add column left','col.left'],['col.right','Table: add column right','col.right'],['col.delete','Table: delete column','col.delete'],['header','Table: toggle header row','header'],['merge','Table: merge cell with right neighbour','merge']] as const)registerCommand({id:`table.${id}`,title,category:'Insert',keywords:['table','cell','row','column'],enabled:inTable,run:async()=>{(await import('./tableCommands')).tableAction(act);}});

registerCommand({id:'edit.wrap',title:'Wrap selected element in a div',category:'Edit',keywords:['wrap','container','group'],enabled:sel,run:async()=>{(await import('./structureCommands')).wrapLayer(getState().selectedElementId!,'div');}});
registerCommand({id:'edit.unwrap',title:'Unwrap selected element (keep content)',category:'Edit',keywords:['unwrap','ungroup','remove wrapper'],enabled:sel,run:async()=>{(await import('./structureCommands')).unwrapLayer(getState().selectedElementId!);}});

// Markdown editor commands. Only Bold and Italic have default bindings; the rest are in the palette and can be assigned in Settings.
const mdActive=()=>/\.(md|markdown)$/i.test(getState().activeFile)&&getState().viewMode!=='design';
const mdRun=(cmd:string)=>async()=>{const [b,f]=await Promise.all([import('./mdBridge'),import('./mdFormat')]);const v=b.getMdSource();if(v)f.runMdCommand(v,cmd as import('./mdFormat').MdCommand);};
const mdCmd=(id:string,title:string,shortcut:string|undefined,run:()=>void|Promise<void>,enabled:()=>boolean=mdActive)=>registerCommand({id,title,category:'Insert',shortcut,keywords:['markdown'],enabled,run});
mdCmd('md.bold','Markdown: Bold','Mod+B',mdRun('bold'));mdCmd('md.italic','Markdown: Italic','Mod+I',mdRun('italic'));
mdCmd('md.code','Markdown: Inline code',undefined,mdRun('code'));mdCmd('md.strike','Markdown: Strikethrough',undefined,mdRun('strike'));
mdCmd('md.bullet','Markdown: Bulleted list',undefined,mdRun('bullet'));mdCmd('md.task','Markdown: Task list',undefined,mdRun('task'));
mdCmd('md.number','Markdown: Numbered list',undefined,mdRun('number'));mdCmd('md.quote','Markdown: Quote',undefined,mdRun('quote'));
mdCmd('md.codeblock','Markdown: Code block',undefined,mdRun('codeblock'));mdCmd('md.table','Markdown: Table',undefined,mdRun('table'));
for(const n of [1,2,3,4,5,6])mdCmd(`md.h${n}`,`Markdown: Heading ${n}`,undefined,mdRun(`h${n}`));
mdCmd('md.reveal','Markdown: Reveal current preview block in source',undefined,()=>{window.dispatchEvent(new Event('somnia:md-reveal'));},()=>/\.(md|markdown)$/i.test(getState().activeFile)&&getState().viewMode!=='code');
mdCmd('md.sync','Markdown: Toggle scroll sync',undefined,async()=>{const b=await import('./mdBridge');b.setSyncScroll(!b.getSyncScroll());},()=>/\.(md|markdown)$/i.test(getState().activeFile)&&getState().viewMode==='split');

