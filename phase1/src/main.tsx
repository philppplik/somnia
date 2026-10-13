import {problemsStore,reportCommandProblem,installProblemsFetch} from './lib/problemsRuntime';
import {heldAgentPaths} from './lib/agent/autosaveHold';
import {newBlankFile} from './lib/projectActions';
import {zipWebFsOptions} from './lib/zipWorkingCopy';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorProject } from '@somnia/editor-core';
import { App } from './App';
import {startStudioRouting} from './lib/studios/studioRouting';
import './lib/studios/openIntake';
import { connectEditorProject, applyOperations } from './store/appStore';
import './styles/global.css';
import './styles/bento.css';
import './styles/agent.css';
import './styles/svg-editor.css';
import './styles/collab-chat.css';
import './styles/variants.css';
import './styles/publish.css';
import './styles/extensions-popup.css';
import './styles/extensions-store.css';
import {isTauri} from '@tauri-apps/api/core';
import {setStoreManaged} from './lib/updates';
import {initLocale} from './lib/i18n';
import {installGlobalErrorHandlers,setNoticeSink,reportError,logInfo,recentLog,reportAclDenied} from './lib/log';
import {copyErrorReport} from './lib/diagnostics/hostStore';
import {initDiagnostics,disposeDiagnosticsSurface} from './lib/diagnostics/bootstrap';
import {requestConfirm} from './lib/confirmService';
import {installConfirmAction} from './lib/studios/openIntake';
import {installNativeIntake} from './lib/intake/installNativeIntake';
import {startCatalogBlocklistMonitor} from './lib/extensions/catalogBlocklist';
import {setCommandReporter} from './lib/invokeCmd';
import {restoreNativeDialogs} from './lib/nativeDialogs';
import {ErrorBoundary} from './components/ErrorBoundary';
problemsStore.start();
const stopProblemsFetch=installProblemsFetch();
if(import.meta.hot)import.meta.hot.dispose(()=>{problemsStore.stop();stopProblemsFetch();});
installGlobalErrorHandlers();
// invokeCmd never logs itself; the bootstrap attaches the logger here (keeps log.ts and invokeCmd.ts free of an import cycle).
setCommandReporter({aclDenied:reportAclDenied,failed:reportCommandProblem});
// Must run before any guard can fire: removes tauri-plugin-dialog's async window.confirm/alert overrides.
restoreNativeDialogs();
// D3: creates the diagnostics client/stores and starts the crash review synchronously, BEFORE the
// intake orchestrator can start (it acquires the initial-review pause in this turn).
initDiagnostics();
// S9: async replace/delete approvals run through the app confirm dialog (ConfirmHost), never window.confirm.
installConfirmAction(requestConfirm);
// D2-E: native open-request intake (file associations, second instance). Web build installs nothing.
installNativeIntake();
// Signed-catalog blocklist: disables + notifies on revoked extensions at launch and every 24h.
// Fail-safe offline; never uninstalls. No-op until a catalog signing key is pinned.
{const disposeBlocklist=startCatalogBlocklistMonitor();if(import.meta.hot)import.meta.hot.dispose(disposeBlocklist);}
initLocale();
import {installDesktopAdapter} from './lib/desktopAdapter';
import {installFileAdapter} from './lib/fileAdapter';
import {createWebFsPort,webFsSupported} from './lib/webFsPort';
import {attachKeyboardShortcuts,registerCommand} from './lib/commands';
import {installBeforeUnload,requestClose} from './lib/closeFlow';
import {readDraft,saveDraft,clearDraft} from './lib/draftSession';
import {patchState,getState,subscribe} from './store/appStore';
import {applyLook} from './lib/look';
import {applyUiPrefs} from './lib/uiPrefs';
import {invoke as tauriInvoke} from '@tauri-apps/api/core';
import {installMcpRuntime} from './lib/agent/mcpRuntime';
import {McpApprovalDialog} from './components/agent/McpApprovalDialog';
if(isTauri())void installMcpRuntime(tauriInvoke as never).refresh();
// Somnia as MCP server: the Rust gateway forwards JSON-RPC to the WebView; the host owns the protocol server.
if(isTauri())void (async()=>{
 const [{installStudioMcpHost},{createStudioMcpSource},{activeStudioDocument},{getMedia},{listen}]=await Promise.all([
  import('./lib/agent/studioMcpHost'),import('./lib/agent/panelBridge'),import('./lib/agent/studioTarget'),import('./lib/media'),import('@tauri-apps/api/event')]);
 void installStudioMcpHost({
  invoke:tauriInvoke as never,
  // Tauri hands the callback an envelope {event,id,payload}; the host wants the payload ({id,message}).
  listen:(event:string,cb:(payload:{id:number;message:string})=>void|Promise<void>)=>listen<{id:number;message:string}>(event,e=>{void cb(e.payload);}),
  source:createStudioMcpSource,
  target:()=>({path:activeStudioDocument(getState(),getMedia()).path}),
  version:typeof __APP_VERSION__!=='undefined'?__APP_VERSION__:'dev',
 }).attach();
})();
// Somnia starts empty: either the last unsaved session (draft) or the empty state. The sample project below exists only for automated tests (dev build, opt-in flag).
const fixture=import.meta.env.DEV&&localStorage.getItem('somnia.fixture')==='starter'?{
 'index.html':'<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Untitled project</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <header id="header"><nav>Somnia studio</nav></header>\n  <main id="main">\n    <section class="hero">\n      <h1>Make room for something new.</h1>\n      <p>Your first idea starts here.</p>\n      <button>Explore</button>\n    </section>\n  </main>\n  <footer>Made locally.</footer>\n</body>\n</html>\n',
 'styles.css':'/* Local project styles. */\nbody { margin: 0; font-family: system-ui, sans-serif; }\n.hero { padding: 80px; }\n'
}:null;
const savedDraft=readDraft();
const draft=getState().workflowPrefs.startup==='last'?savedDraft:null;
const initial=draft?draft.files:fixture;
const disconnect=initial?connectEditorProject(new EditorProject(initial),{name:'Untitled project',alreadySaved:false}):()=>{};
if(!fixture&&!draft&&getState().workflowPrefs.startup==='blank')newBlankFile();
if(draft){patchState({notice:'Restored your unsaved session from this device. Save it to a folder, or use Project > Close project to discard it.',...(draft.activeFile in draft.files?{activeFile:draft.activeFile}:{})});}
let draftTimer=0;
subscribe(()=>{const st=getState();window.clearTimeout(draftTimer);if(st.storage!=='memory'||!st.workflowPrefs.draftAutosave)return;if(!st.coreConnected||!st.isDirty)return;draftTimer=window.setTimeout(()=>{const s2=getState();if(s2.storage==='memory'&&s2.isDirty&&!heldAgentPaths().length)saveDraft({files:s2.files,activeFile:s2.activeFile,openFiles:s2.openFiles});},st.workflowPrefs.draftSeconds*1000);});
if(import.meta.hot)import.meta.hot.dispose(disconnect);
applyLook(getState().look);
applyUiPrefs(getState().uiPrefs);
setNoticeSink(text=>patchState({notice:text}));
logInfo('app','Somnia started',{desktop:isTauri()});
startStudioRouting();
// Shortcuts are bound at module start, not in an App effect: the effect only runs after the first commit, so a keypress right after page load (slow CPU, CI) was dropped.
{const detachShortcuts=attachKeyboardShortcuts();if(import.meta.hot)import.meta.hot.dispose(detachShortcuts);}
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary label="Somnia" onFatal={disposeDiagnosticsSurface}><App/><McpApprovalDialog/></ErrorBoundary></StrictMode>);

if(!isTauri())installBeforeUnload(()=>getState().isDirty&&getState().storage!=='disk');
if(import.meta.env.DEV)(window as unknown as {__somnia:object}).__somnia={patch:patchState,recentLog,copyErrorReport,requestClose,setSource:(file:string,text:string)=>applyOperations([{type:'replaceSource',file,text}] as never)};
// Dev/test control hook (plan 2.2): the flag is statically replaced by Vite, so release bundles drop this import entirely.
if(import.meta.env.VITE_SOMNIA_CONTROL==='1'&&!isTauri())void import('./dev/installWebControl').then(m=>m.installWebControl());
if(isTauri())document.documentElement.dataset.shell='desktop';
if(isTauri())void import('./lib/extensions/selftestApp').then(m=>m.maybeRunNativeSelftest()).catch(()=>{/* self-test is CI-only */});
// LAN-Direct hosting is a desktop feature: register the Rust host with the collab engine only inside Tauri.
if(isTauri())void import('./lib/collab/lanHost').then(m=>import('./lib/collab/lanHostPort').then(p=>p.registerLanHost({startLanHost:m.startLanHost,stopLanHost:m.stopLanHost,createLanSessionLinks:m.createLanSessionLinks}))).catch(e=>reportError('startup.lan-host',e,{message:'LAN hosting could not be loaded',notify:'LAN hosting is unavailable.'}));
if(isTauri())setStoreManaged(import('@tauri-apps/api/core').then(m=>m.invoke<boolean>('is_store_package')).catch(e=>{reportError('startup.store-package',e,{level:'warn'});return false;}));
if(isTauri())void installDesktopAdapter().catch(error=>reportError('startup.desktop-adapter',error,{message:'Desktop file access did not start',notify:'File access is unavailable. Saving to disk may not work.'}));
else if(webFsSupported()&&!location.search.includes('fallback=zip'))void installFileAdapter(createWebFsPort()).catch(error=>reportError('startup.file-adapter',error,{message:'Browser file access did not start',notify:'File access is unavailable in this browser session.'}));
else void installFileAdapter(createWebFsPort({...zipWebFsOptions(),canReconnect:false})).catch(error=>console.error(error));
