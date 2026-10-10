import {useEffect,useState,useSyncExternalStore} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getVersionsSession,subscribeVersionsSession} from '../../lib/versionsSession';
import {watchGitInvalidation,type GitInvalidation} from '../../lib/git/invalidation';
/** A hint re-runs reads only. It never saves editor buffers or starts a Git write. */
export function useGitInvalidation():number {
 const session=useSyncExternalStore(subscribeVersionsSession,getVersionsSession,getVersionsSession);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!isTauri()||!session)return;
  return watchGitInvalidation({listen:(event,handler)=>listen<GitInvalidation>(event,handler)},session.projectId,()=>setRevision(n=>n+1));
 },[session?.projectId]);
 return revision;
}
