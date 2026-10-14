import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import type {RuntimeSnapshot} from '../../lib/agent/localModels';
export function LocalFirstRunGuide({snapshot,onRefresh,busy}:{snapshot:RuntimeSnapshot|null;onRefresh:()=>void;busy:boolean}){
 const {t}=useT();if(snapshot?.state!=='not-found')return null;
 return <section className="local-models-runtime" aria-label={t('local.setup.title')}><h4>{t('local.setup.title')}</h4><p>{t('local.setup.boundary')}</p><ol className="local-setup-steps"><li>{t('local.setup.download')} <a href="https://ollama.com/download" target="_blank" rel="noreferrer">{t('local.install')}</a></li><li>{t('local.setup.start')}</li><li>{t('local.setup.linux')} <a href="https://docs.ollama.com/linux" target="_blank" rel="noreferrer">{t('local.setup.linuxGuide')}</a></li><li>{t('local.setup.next')}</li></ol><Button disabled={busy} type="button" onClick={onRefresh}>{t('local.refresh')}</Button><p>{t('local.setup.noGuarantee')}</p></section>;
}
