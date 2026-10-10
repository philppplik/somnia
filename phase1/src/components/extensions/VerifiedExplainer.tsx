import {AlertTriangle} from 'lucide-react';
import {useT} from '../../lib/useT';
import {StoreModal} from './StoreParts';
import {VerifiedBadge} from './parts';

const ROWS=['verified','github','official','build'] as const;
/** "Means / does not mean" for each indicator. Identity, review and build facts stay separate; nothing here claims safety. */
export function VerifiedExplainer({open,onClose}:{open:boolean;onClose:()=>void}){
 const {t}=useT();
 return <StoreModal open={open} onClose={onClose} title={t('store.explain.title')} subtitle={t('store.explain.lead')} wide>
  <ul className="store-explain">{ROWS.map(k=><li key={k} className="store-explain-row"><div className="store-explain-name">{k==='verified'?<VerifiedBadge criterion={t('store.verified')} size={20}/>:null}<strong>{t(`store.explain.${k}.name`)}</strong></div><div><p><span className="sr-only">{t('store.explain.means')}: </span>{t(`store.explain.${k}.means`)}</p><p className="store-explain-not"><span className="sr-only">{t('store.explain.not')}: </span>{t(`store.explain.${k}.not`)}</p></div></li>)}</ul>
  <div className="store-warn"><AlertTriangle size={18} aria-hidden="true"/><p>{t('store.explain.warn')}</p></div>
  <div className="store-modal-foot"><p className="store-reply">{t('store.explain.note')}</p><button type="button" className="ext-btn ext-btn-primary" onClick={onClose}>{t('store.explain.close')}</button></div>
 </StoreModal>;
}
