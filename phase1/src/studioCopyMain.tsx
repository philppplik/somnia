import {invokeCmd} from './lib/invokeCmd';
// Satellite bootstrap: intentionally no main-window adapters, autosave, credentials or MCP.
import {createRoot} from 'react-dom/client';
import {EditorProject} from '@somnia/editor-core';
import {connectEditorProject,patchState} from './store/appStore';
import {applyLook} from './lib/look';
import {applyUiPrefs} from './lib/uiPrefs';
import {getState} from './store/appStore';
import {isTauri} from '@tauri-apps/api/core';
import {setLocale,t} from './lib/i18n';
import {validateSnapshot} from './lib/workspace/handoff';
import {StudioCopy} from './components/workspace/StudioCopy';
import './styles/global.css';
import './styles/bento.css';
import './components/workspace/docking.css';
async function start(){
 const raw=isTauri()?await invokeCmd('studio_copy_take',{}):import.meta.env.DEV?JSON.parse(sessionStorage.getItem('somnia.copy.test')??'null'):null;
 const s=validateSnapshot(raw);setLocale(s.locale);connectEditorProject(new EditorProject(s.files),{name:s.name,alreadySaved:true});
 patchState({activeStudio:'code',studioChoice:'manual',activeFile:s.activeFile,openFiles:Object.keys(s.files),storage:'memory',nativeConnected:false,livePreview:false,viewMode:'code'});
 document.documentElement.dataset.theme=getState().theme;document.documentElement.dataset.contrast=getState().contrast;document.documentElement.dataset.codeTheme=getState().codeTheme;applyLook(getState().look);applyUiPrefs(getState().uiPrefs);
 createRoot(document.getElementById('root')!).render(<StudioCopy/>);
}
void start().catch(()=>{document.getElementById('root')!.textContent=t('workspace.failed');});
