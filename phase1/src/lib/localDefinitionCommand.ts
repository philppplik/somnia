import {getActiveEditor} from './editorBridge';import {getState,getProjectGeneration,jumpToSourceSpan,patchState} from '../store/appStore';import {findLocalDefinition} from './localDefinition';import {t} from './i18n';
export function goToLocalDefinition(){
 const view=getActiveEditor(),state=getState(),generation=getProjectGeneration();
 if(!view||!view.dom.isConnected||state.activeStudio!=='code'||!state.coreConnected||view.state.doc.toString()!==state.files[state.activeFile]){patchState({notice:t('code.definition.stale')});return;}
 const {from,to}=view.state.selection.main,raw=view.state.doc.toString(),file=state.activeFile;
 const result=findLocalDefinition(file,raw,from,to);
 if(getActiveEditor()!==view||getProjectGeneration()!==generation||getState().activeFile!==file||getState().files[file]!==raw){patchState({notice:t('code.definition.stale')});return;}
 if(result.status==='found'){if(jumpToSourceSpan(file,{from:result.from,to:result.to,raw}))patchState({notice:t('code.definition.found',{name:result.name})});else patchState({notice:t('code.definition.stale')});}
 else patchState({notice:t(`code.definition.${result.status}`)});
}
