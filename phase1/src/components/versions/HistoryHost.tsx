import {useMemo,useSyncExternalStore} from 'react';
import type {GitBackend} from '../../lib/git/types';
import {HistoryController,type RestoreOutcome} from '../../lib/git/history/history';
import {createRecoveryBackend} from '../../lib/git/history/recovery';
import {getVersionsSession,subscribeVersionsSession,type VersionsSession} from '../../lib/versionsSession';
import {patchState} from '../../store/appStore';
import {useT} from '../../lib/useT';
import {HistoryTab} from './HistoryTab';
import {SafetyBrowser} from './SafetyBrowser';
import {SafetyController} from '../../lib/git/refs/safety';
import type {GitRefsBackend} from '../../lib/git/refs/contract';
import './history.css';
/** Mirrors a finished restore into the editor. Recovery never goes through the autosave subscriber (it would clear the safety hold). */
export async function applyRestoreToEditor(session:VersionsSession,outcome:RestoreOutcome){
 if(outcome.kind==='recovery'){const {event,content}=outcome.result;await session.applyRecoveryRestore(event.path,content,event);patchState({notice:`Restored ${event.path} from recovery. It stays unsaved until you save it.`});return;}
 const r=await session.reloadFromDisk();
 patchState({notice:r.note??(r.changed.length?`Restored version. Reloaded ${r.changed.length} file(s) from disk.`:'Restored version. No open file changed.')});}
export function HistoryHost({backend,refs}:{backend:GitBackend;refs?:GitRefsBackend}){
 const {t}=useT();const session=useSyncExternalStore(subscribeVersionsSession,getVersionsSession,getVersionsSession);
 const controller=useMemo(()=>session?new HistoryController(backend,createRecoveryBackend(session.port,session.projectId,session.nextRevision),()=>session.hasUnsavedBuffers()):null,[backend,session]);
 const safety=useMemo(()=>session&&refs?new SafetyController(backend,refs,()=>session.hasUnsavedBuffers()):null,[backend,refs,session]);
 if(!session||!controller)return <p className="p-4 text-xs text-ink-3" role="status" data-testid="history-noproject">{t('versions.history.needsProject')}</p>;
 return <HistoryTab controller={controller} onRestored={o=>applyRestoreToEditor(session,o)} safetySlot={safety?key=>(<SafetyBrowser controller={safety} refreshKey={key} onRestored={r=>applyRestoreToEditor(session,{kind:'version',result:r})}/>):undefined}/>;}
