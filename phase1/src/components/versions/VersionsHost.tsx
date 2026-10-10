import {useMemo} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {getSavedFile,useAppStore} from '../../store/appStore';
import {executeCommand} from '../../lib/commands';
import {PublicationReview} from './PublicationReview';
import {createPublicationBackend} from '../../lib/git/publication/types';
import {getAdvanced,subscribeAdvanced} from './vocab';
import {useSyncExternalStore} from 'react';
import {VersionsPanel} from './VersionsPanel';
import {createTauriGitBackend,getGitBackend} from './backend';
import type {GitBackend} from '../../lib/git/types';
import {HistoryHost} from './HistoryHost';
import {CompareTab} from './CompareTab';
import {VariantsHost} from './VariantsHost';
/** Number of project files whose editor text differs from what is on disk. */
import {countUnsaved} from './countUnsaved';
export {countUnsaved};
let tauri:GitBackend|null=null;
/** Registered backend (tests, web preview fakes) or the Tauri one inside the desktop app; null in the browser. */
export function resolveBackend():GitBackend|null{
 const set=getGitBackend();if(set)return set;
 if(!isTauri())return null;return tauri??=createTauriGitBackend(invoke);}
/** Sidebar entry: wires the app store (unsaved buffers, save command) into the panel. */
export function VersionsHost(){
 const s=useAppStore();const unsaved=useMemo(()=>countUnsaved(s.files,getSavedFile),[s.files,s.isDirty,s.lastSavedAt]);
 const backend=resolveBackend();const advanced=useSyncExternalStore(subscribeAdvanced,getAdvanced,getAdvanced);
 const publication=useMemo(()=>isTauri()?createPublicationBackend(invoke):null,[]);
 return <VersionsPanel publicationSlot={publication?<PublicationReview backend={publication} unsavedFiles={unsaved} advanced={advanced}/>:undefined} backend={backend} unsavedFiles={unsaved} onSaveFiles={async()=>{await executeCommand('project.save');}} historySlot={backend?<HistoryHost backend={backend}/>:undefined} variantsSlot={backend?go=>(<VariantsHost backend={backend} onSaveVersion={go}/>):undefined} compareSlot={backend?<CompareTab backend={backend}/>:undefined}/>;}
