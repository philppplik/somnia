import {useState, useSyncExternalStore} from 'react';
import {agentPrivacy, PROVIDER_PRIVACY_POLICIES, type AIProvenance} from '../../lib/agent/privacy';
import {type AgentPrivacyTranslate} from '../../lib/agent/privacyStrings';
import {t as appTranslate} from '../../lib/i18n';
import {useT} from '../../lib/useT';
const agentPrivacyEnglish: AgentPrivacyTranslate = key => appTranslate(key);
type Props = {t?: AgentPrivacyTranslate};
function PrivacyPolicies({t = agentPrivacyEnglish}: Props) {
  return <nav aria-label={t('agent.privacy.policies')} className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
    {PROVIDER_PRIVACY_POLICIES.map(policy => <a key={policy.name} className="underline" href={policy.url} target="_blank" rel="noopener noreferrer">{policy.name}</a>)}
  </nav>;
}
export function AgentErrorNotice({t = agentPrivacyEnglish}: Props) {
  useT();
  return <p className="text-xs text-ink-2" data-testid="agent-ai-warning">{t('agent.ai.warning')}</p>;
}
export function AIGeneratedLabel({provenance, t = agentPrivacyEnglish}: Props & {provenance?: AIProvenance}) {
  useT();
  return <span className="text-xs text-ink-2" data-generated-by="ai" data-ai-provider={provenance?.provider} data-ai-model={provenance?.model}>
    {t(provenance?.humanReviewed ? 'agent.ai.reviewed' : 'agent.ai.label')}
  </span>;
}
export function AgentConsentNotice({t = agentPrivacyEnglish, onGranted, showTitle = true}: Props & {onGranted?: () => void; showTitle?: boolean}) {
  useT();
  const [checked, setChecked] = useState(false);
  const [failed, setFailed] = useState(false);
  const granted = useSyncExternalStore(agentPrivacy.subscribe, agentPrivacy.hasConsent, () => false);
  if (granted) return null;
  return <section aria-label={t('agent.privacy.title')} className="rounded-2xl border border-line bg-panel p-4 space-y-3" style={{padding: 16}}>
    {showTitle && <h3 className="font-medium">{t('agent.privacy.title')}</h3>}
    <p className="text-sm">{t('agent.privacy.disclosure')}</p>
    <PrivacyPolicies t={t}/>
    <p className="text-xs text-ink-2">{t('agent.privacy.review')}</p>
    <label className="flex items-start gap-2 text-sm" style={{justifyContent: 'flex-start', gap: 10}}><input style={{width:16, minWidth:16, height:16, flex:"0 0 16px", marginTop:3}} type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)}/><span>{t('agent.privacy.consent')}</span></label>
    <button type="button" disabled={!checked} className="rounded-lg border border-line px-3 py-2 disabled:opacity-50" onClick={() => {
      if (!checked) return;
      if (agentPrivacy.grantExplicitConsent()) { setFailed(false); onGranted?.(); } else setFailed(true);
    }}>{t('agent.privacy.enable')}</button>
    {failed && <p role="alert">{t('agent.privacy.saveFailed')}</p>}
    <p className="text-xs text-ink-2">{t('agent.privacy.local')}</p>
  </section>;
}
export function AgentPrivacySettings({t = agentPrivacyEnglish}: Props) {
  useT();
  const granted = useSyncExternalStore(agentPrivacy.subscribe, agentPrivacy.hasConsent, () => false);
  return <section aria-label={t('agent.privacy.title')} className="space-y-3">
    <h3 className="font-medium">{t('agent.privacy.title')}</h3>
    <p role="status">{t(granted ? 'agent.privacy.enabled' : 'agent.privacy.disabled')}</p>
    {granted ? <button type="button" className="rounded-lg border border-line px-3 py-2" onClick={() => agentPrivacy.revoke()}>{t('agent.privacy.revoke')}</button> : <AgentConsentNotice t={t} showTitle={false}/>}
    <p className="text-sm text-ink-2">{t('agent.privacy.withdrawal')}</p>
    {granted && <PrivacyPolicies t={t}/>}
  </section>;
}
