import {invokeCmd} from '../lib/invokeCmd';
import {isTauri} from '@tauri-apps/api/core';
import {getState} from './appStore';
import {getMedia} from '../lib/media';
import {getLocale,t} from '../lib/i18n';
import {validateSnapshot} from '../lib/workspace/handoff';
export const canPopoutCode=()=>isTauri()&&getState().activeStudio==='code'&&getState().coreConnected&&!getMedia().items.length;
export async function popoutCode(){
 if(!canPopoutCode())throw Error(t('workspace.unsupported'));
 const s=getState();const snapshot=validateSnapshot({version:1,studio:'code',name:s.projectName||'Somnia',files:s.files,activeFile:s.activeFile,locale:getLocale()});
 try{await invokeCmd('studio_copy_open',{snapshot});}catch{throw Error(t('workspace.failed'));}
}
