import type {LocalRuntimePreferences} from '../../lib/agent/settings';
import {useT} from '../../lib/useT';
import {Input} from '../ui/input';
export function LocalRuntimeAdvanced({value,onChange,disabled}:{value:LocalRuntimePreferences|undefined;onChange:(p:LocalRuntimePreferences)=>void;disabled:boolean}){
 const {t}=useT();const edit=(key:'numCtx'|'keepAliveSeconds',raw:string)=>{const next={...value,version:1 as const};if(raw==='')delete next[key];else next[key]=Number(raw);onChange(next);};
 return <details><summary>{t('local.advanced.title')}</summary><p>{t('local.advanced.boundary')}</p><label>{t('local.advanced.context')}<Input type="number" min={1} max={1048576} step={1} disabled={disabled} value={value?.numCtx??''} onChange={e=>edit('numCtx',e.target.value)}/></label><label>{t('local.advanced.keepAlive')}<Input type="number" min={0} max={86400} step={1} disabled={disabled} value={value?.keepAliveSeconds??''} onChange={e=>edit('keepAliveSeconds',e.target.value)}/></label></details>;
}
