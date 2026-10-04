import {zipWebFsOptions} from './lib/zipWorkingCopy';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorProject } from '@somnia/editor-core';
import { App } from './App';
import { connectEditorProject } from './store/appStore';
import './styles/global.css';
import './styles/bento.css';
import {isTauri} from '@tauri-apps/api/core';
import {installDesktopAdapter} from './lib/desktopAdapter';
import {installFileAdapter} from './lib/fileAdapter';
import {createWebFsPort,webFsSupported} from './lib/webFsPort';
import {registerCommand} from './lib/commands';
import {installBeforeUnload,requestClose} from './lib/closeFlow';
import {readDraft,saveDraft,clearDraft} from './lib/draftSession';
import {patchState,getState,subscribe} from './store/appStore';
// Deliberately memory-only. Replace with choose_project -> read_file in the desktop integrator.
const starter={
 'index.html':'<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Untitled project</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <header id="header"><nav>Somnia studio</nav></header>\n  <main id="main">\n    <section class="hero">\n      <h1>Make room for something new.</h1>\n      <p>Your first idea starts here.</p>\n      <button>Explore</button>\n    </section>\n  </main>\n  <footer>Made locally.</footer>\n</body>\n</html>\n',
 'styles.css':'/* Local project styles. */\nbody { margin: 0; font-family: system-ui, sans-serif; }\n.hero { padding: 80px; }\n'
};
const draft=readDraft();
const project=new EditorProject(draft?draft.files:starter);
const disconnect=connectEditorProject(project,{name:'Untitled project',alreadySaved:false});
if(draft){patchState({notice:'Restored your unsaved draft from this device. Use Project > Reset to starter project to discard it.',...(draft.activeFile in draft.files?{activeFile:draft.activeFile}:{})});}
let draftTimer=0;
subscribe(()=>{const st=getState();window.clearTimeout(draftTimer);if(st.storage!=='memory')return;if(!st.coreConnected||!st.isDirty)return;draftTimer=window.setTimeout(()=>{const s2=getState();if(s2.storage==='memory'&&s2.isDirty)saveDraft({files:s2.files,activeFile:s2.activeFile,openFiles:s2.openFiles});},800);});
registerCommand({id:'project.resetDraft',title:'Reset to starter project',category:'Project',enabled:()=>getState().storage==='memory',run:()=>{if(!window.confirm('Discard the unsaved draft and reload the starter project?'))return;clearDraft();location.reload();}});
if(import.meta.hot)import.meta.hot.dispose(disconnect);
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);

if(!isTauri())installBeforeUnload(()=>getState().isDirty&&getState().storage!=='disk');
if(import.meta.env.DEV)(window as unknown as {__somnia:object}).__somnia={requestClose};
if(isTauri())document.documentElement.dataset.shell='desktop';
if(isTauri())void installDesktopAdapter().catch(error=>console.error(error));
else if(webFsSupported()&&!location.search.includes('fallback=zip'))void installFileAdapter(createWebFsPort()).catch(error=>console.error(error));
else void installFileAdapter(createWebFsPort({...zipWebFsOptions(),canReconnect:false})).catch(error=>console.error(error));
