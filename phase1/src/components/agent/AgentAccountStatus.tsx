import {useT} from '../../lib/useT';
import {patchState} from '../../store/appStore';
import type {AuthProvider} from '../../lib/agent/providerAuth';
import {useAccountStatus} from './useAccountStatus';
export function AgentAccountStatus({provider}:{provider:AuthProvider}){
 const {t}=useT(),{status,error,desktop}=useAccountStatus(provider);
 if(provider!=='openai')return null;
 const text=!desktop?'desktop':error?'unavailable':!status?'checking':status.method==='api-key'?'apiKey':status.state;
 return <div className="agent-account-summary"><span role="status">{t('accountAuth.panel',{status:t(`accountAuth.state.${text}`)})}</span><button type="button" onClick={()=>patchState({settingsOpen:true,settingsSection:'AI',settingsAITab:'providers'})}>{t('accountAuth.manage')}</button></div>;
}
