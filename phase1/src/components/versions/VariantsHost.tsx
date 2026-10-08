import {useMemo} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import type {GitBackend,GitVariantsBackend} from '../../lib/git/types';
import {tauriVariantsBackend} from '../../lib/git/variantsBackend';
import type {VariantGuards} from '../../lib/git/variantsFlow';
import {getVersionsSession} from '../../lib/versionsSession';
import {heldAgentPaths} from '../../lib/agent/autosaveHold';
import {getSavedFile,getState,patchState} from '../../store/appStore';
import {VariantsTab} from './VariantsTab';
import {getVariantsBackend} from './variantsBackendRegistry';
/** Unsaved editor buffers and unreviewed applied AI changes block switching or combining. */
export function editorGuards():VariantGuards{
 return{unsavedBuffers:()=>{const dirty=Object.entries(getState().files).filter(([f,t])=>getSavedFile(f)!==t).map(([f])=>f);
   const s=getVersionsSession();if(!dirty.length&&s?.hasUnsavedBuffers())dirty.push('(autosave)');return dirty;},
  activeReviews:()=>heldAgentPaths()};}
let tauriBackend:GitVariantsBackend|null=null;
/** One adapter per window: a fresh object per render would restart the tab's refresh effect forever. */
const resolveVariants=()=>getVariantsBackend()??(isTauri()?(tauriBackend??=tauriVariantsBackend(invoke as never)):null);
export function VariantsHost({backend,onSaveVersion}:{backend:GitBackend;onSaveVersion:()=>void}){
 const variants=resolveVariants();
 const deps=useMemo(()=>variants?{git:backend,variants,guards:editorGuards()}:null,[backend,variants]);
 if(!deps)return null;
 const onDiskChanged=()=>{const s=getVersionsSession();if(!s)return;void s.reloadFromDisk().then(r=>{if(r.note)patchState({notice:r.note});}).catch(e=>patchState({notice:`Reload from disk failed: ${String(e)}`}));};
 return <VariantsTab deps={deps} onDiskChanged={onDiskChanged} onSaveVersion={onSaveVersion}/>;}
