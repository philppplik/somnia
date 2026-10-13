import {useSyncExternalStore} from 'react';
import {useT} from '../lib/useT';
import {commandDispatcher} from '../lib/commandDispatcher';
import {staticBuilder} from '../lib/frameworks/staticBuildRuntime';
import {FrameworkBuildView} from './FrameworkBuildView';
import {useAppStore} from '../store/appStore';
import {detectFramework} from '../lib/frameworks/detect';
import {isTauri} from '@tauri-apps/api/core';
/** Builds the project for publishing and shows what would be uploaded. Nothing leaves this computer. */
export function FrameworkBuildPanel(){
 const {t}=useT();const state=useSyncExternalStore(staticBuilder.subscribe,staticBuilder.getSnapshot,staticBuilder.getSnapshot);
 const app=useAppStore();const found=detectFramework(app.files);
 const busy=['installing','building','collecting'].includes(state.phase);
 if(!isTauri()||!found||found.output!=='static'||app.activeStudio!=='code')return null;
 return <FrameworkBuildView state={state} busy={busy} onBuild={()=>void commandDispatcher.runCommand('frameworks.buildStatic',{},{origin:'ui'}).catch(()=>{})} onCancel={()=>void staticBuilder.cancel()} t={t}/>;
}
