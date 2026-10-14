import {invoke,isTauri} from '@tauri-apps/api/core';
import {LOCAL_MODEL_CATALOG} from './localModelAdvice';
export interface ModelDisk {token:string;freeBytes:number;checkedAt:number;source:'user-selected-volume'}
export async function chooseModelDisk():Promise<ModelDisk|null>{return isTauri()?invoke('local_models_disk_choose'):null;}
export async function refreshModelDisk(token:string):Promise<ModelDisk>{return invoke('local_models_disk_check',{token});}
export function modelDiskAdvice(model:string,disk:ModelDisk|null,now=Date.now()):{state:'unknown'|'stale'|'insufficient'|'estimated-fit';requiredBytes?:number}{
 const estimate=LOCAL_MODEL_CATALOG.find(e=>e.tag===model)?.estimatedBytes;
 if(!disk||disk.source!=='user-selected-volume'||!Number.isSafeInteger(disk.freeBytes)||disk.freeBytes<0||!estimate)return {state:'unknown'};
 if(!Number.isFinite(disk.checkedAt)||now-disk.checkedAt>60000||now<disk.checkedAt)return {state:'stale'};
 const requiredBytes=Math.ceil(estimate*1.25+1024**3);return {state:disk.freeBytes<requiredBytes?'insufficient':'estimated-fit',requiredBytes};
}
