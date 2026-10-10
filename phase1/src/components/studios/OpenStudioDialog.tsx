import {useEffect,useState,useSyncExternalStore} from 'react';
import {FolderOpen} from 'lucide-react';
import {ConfirmShell,FileCard} from '../ConfirmShell';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {getStudio} from '../../lib/studios/registry';
import {getOpenChoice,subscribeOpenChoice,answerOpenChoice} from '../../lib/studios/openChoice';
export function OpenStudioDialog(){
 const choice=useSyncExternalStore(subscribeOpenChoice,getOpenChoice,getOpenChoice);const {t}=useT();
 const [selected,setSelected]=useState('');
 useEffect(()=>{setSelected(choice?.candidates.some(h=>h.studioId===choice.suggested)?choice.suggested!:choice?.candidates[0]?.studioId??'');},[choice]);
 return <ConfirmShell open={!!choice} onCancel={()=>answerOpenChoice(null)} tone="accent" Icon={FolderOpen} ariaLabel={t('openRouter.title')} title={t('openRouter.title')} description={t('openRouter.description')}
 body={<><FileCard name={choice?.name??''} status={t('openRouter.file')}/><label className="dlg-option"><span>{t('openRouter.studio')}</span><select aria-label={t('openRouter.studio')} value={selected} onChange={e=>setSelected(e.target.value)} className="rounded-lg border border-subtle bg-panel p-2 text-ink">{choice?.candidates.map(h=><option key={h.id} value={h.studioId}>{t(getStudio(h.studioId).label)}{h.studioId===choice.suggested?' '+t('openRouter.suggested'):''}{h.capability==='preview'?' '+t('openRouter.preview'):''}</option>)}</select></label><p className="text-sm text-ink-2">{t(choice?.candidates.length?'openRouter.safe':'openRouter.unavailable')}</p></>}
 footer={<><span className="dlg-spacer"/><Button onClick={()=>answerOpenChoice(null)}>{t('dialogs.cancel')}</Button><Button variant="primary" disabled={!selected} onClick={()=>answerOpenChoice(selected)}>{t('openRouter.open')}</Button></>}/>;
}
