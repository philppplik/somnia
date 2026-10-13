import '../../styles/agent-board.css';
import {useState,useSyncExternalStore,useMemo} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {getAgentBoardPort,subscribeAgentBoardPort} from '../../lib/agentBoard/registry';
import {assertRequest,reviewIsCurrent} from '../../lib/agentBoard/model';
import type {BoardRequest} from '../../lib/agentBoard/contracts';
import {resolveBackend} from '../versions/VersionsHost';
import {getVariantsBackend} from '../versions/variantsBackendRegistry';
import {tauriVariantsBackend} from '../../lib/git/variantsBackend';
import {editorGuards} from '../versions/VariantsHost';
import {VariantsTab} from '../versions/VariantsTab';
import {getVersionsSession} from '../../lib/versionsSession';
import {patchState} from '../../store/appStore';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {AgentBoard} from './AgentBoard';
const nativeVariants=isTauri()?tauriVariantsBackend(invoke as never):null;
export function AgentBoardHost(){
 const port=useSyncExternalStore(subscribeAgentBoardPort,getAgentBoardPort,getAgentBoardPort),{t}=useT();
 const [combine,setCombine]=useState<{request:BoardRequest;branch:string}|null>(null);
 const git=resolveBackend(),variants=getVariantsBackend()??nativeVariants;
 const deps=useMemo(()=>git&&variants?{git,variants,guards:editorGuards()}:null,[git,variants]);
 if(!port)return <p className="ab-empty">{t('board.unavailable')}</p>;
 const check=()=>{if(!combine)throw Error('board.error.stale');const task=assertRequest(port.getSnapshot(),combine.request);if(!reviewIsCurrent(task,combine.request.binding))throw Error('board.error.stale');};
 if(combine&&deps)return <div><Button onClick={()=>setCombine(null)}>{t('board.close')}</Button><VariantsTab deps={deps} initialCombineTarget={combine.branch} beforeCombine={check} onDiskChanged={()=>{void getVersionsSession()?.reloadFromDisk().catch(()=>patchState({notice:t('board.error.action')}));}}/></div>;
 return <AgentBoard port={port} onCombine={deps?async(request,branch)=>{setCombine({request,branch});}:undefined}/>;
}
