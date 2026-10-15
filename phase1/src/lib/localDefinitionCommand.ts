import {getActiveEditor} from './editorBridge';import {getCodeEditorHost} from './codeEditorHost';import {findLocalDefinition} from './localDefinition';import {t} from './i18n';
export function goToLocalDefinition(){
 const host=getCodeEditorHost(),view=getActiveEditor(),state=host.read(),generation=host.generation();
 if(!view||!view.dom.isConnected||state.activeStudio!=='code'||!state.coreConnected||view.state.doc.toString()!==state.files[state.activeFile]){host.notice(t('code.definition.stale'));return;}
 const {from,to}=view.state.selection.main,raw=view.state.doc.toString(),file=state.activeFile;
 const result=findLocalDefinition(file,raw,from,to);
 if(getCodeEditorHost()!==host||getActiveEditor()!==view||host.generation()!==generation||host.read().activeFile!==file||host.read().files[file]!==raw){host.notice(t('code.definition.stale'));return;}
 if(result.status==='found'){if(host.reveal(file,{from:result.from,to:result.to,raw}))host.notice(t('code.definition.found',{name:result.name}));else host.notice(t('code.definition.stale'));}
 else host.notice(t(`code.definition.${result.status}`));
}
