import {useMemo} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {getSavedFile,useAppStore} from '../../store/appStore';
import {executeCommand} from '../../lib/commands';
import {VersionsPanel} from './VersionsPanel';
import {createTauriGitBackend,getGitBackend} from './backend';
import type {GitBackend} from '../../lib/git/types';
/** Number of project files whose editor text differs from what is on disk. */
export const countUnsaved=(files:Readonly<Record<string,string>>,saved:(f:string)=>string)=>Object.entries(files).filter(([f,t])=>saved(f)!==t).length;
let tauri:GitBackend|null=null;
/** Registered backend (tests, web preview fakes) or the Tauri one inside the desktop app; null in the browser. */
export function resolveBackend():GitBackend|null{
 const set=getGitBackend();if(set)return set;
 if(!isTauri())return null;return tauri??=createTauriGitBackend(invoke);}
/** Sidebar entry: wires the app store (unsaved buffers, save command) into the panel. */
export function VersionsHost(){
 const s=useAppStore();const unsaved=useMemo(()=>countUnsaved(s.files,getSavedFile),[s.files,s.isDirty,s.lastSavedAt]);
 return <VersionsPanel backend={resolveBackend()} unsavedFiles={unsaved} onSaveFiles={async()=>{await executeCommand('project.save');}}/>;}
