import {textStudioLinks} from '../../lib/workspace/smartLinks';
import {NativeButton} from '../ui/native-controls';
import {useT} from '../../lib/useT';
import {executeCommand} from '../../lib/commands';
import {canPopoutCode} from '../../store/workspacePopout';
import {useAppStore} from '../../store/appStore';
import {getStudio} from '../../lib/studios';
import {studioPanels} from '../../lib/shell/codePanels';
import {registerWorkspaceCommands} from '../../store/workspaceCommands';
import {useEffect} from 'react';
export function WorkspaceTools(){const state=useAppStore(),{t}=useT();useEffect(()=>{const off=registerWorkspaceCommands();return()=>off.forEach(f=>f());},[]);return <div className="workspace-tools">{textStudioLinks(state.activeFile,state.files[state.activeFile]??'').filter(id=>id!==state.activeStudio).map(id=><NativeButton key={id} className="max-[1700px]:hidden" onClick={()=>void executeCommand('workspace.openIn',{studio:id})}>{t('workspace.openIn',{studio:t(getStudio(id).label)})}</NativeButton>)}<NativeButton aria-label={t('workspace.toggle')} title={t('workspace.toggle')} disabled={!studioPanels(getStudio(state.activeStudio)).length} onClick={()=>void executeCommand('workspace.docking')}>▤</NativeButton><NativeButton aria-label={t('workspace.reset')} title={t('workspace.reset')} onClick={()=>void executeCommand('workspace.resetDock')}>↺</NativeButton><NativeButton aria-label={t('workspace.popout')} title={t('workspace.popout')} disabled={!canPopoutCode()} onClick={()=>void executeCommand('workspace.popout')}>↗</NativeButton></div>;}
