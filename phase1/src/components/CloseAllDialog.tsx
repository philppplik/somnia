import {TriangleAlert} from 'lucide-react';
import {Button} from './ui/button';
import {ConfirmShell,FileCard} from './ConfirmShell';
import {useAppStore} from '../store/appStore';
import {useT} from '../lib/useT';
import {cancelCloseAll,resolveCloseAll} from '../lib/workDocsActions';
/** Close all files while some have unsaved changes: save them all, discard them, or cancel. */
export function CloseAllDialog(){
 const {t}=useT();const s=useAppStore();const items=s.closeAllPrompt;
 return <ConfirmShell open={!!items} onCancel={cancelCloseAll} alert tone="warning" Icon={TriangleAlert} ariaLabel={t('workdocs.dialog.aria')} title={t('workdocs.dialog.title')} description={t('workdocs.dialog.desc',{count:items?.length??0})}
  body={<>{(items??[]).slice(0,8).map(d=><FileCard key={d.studio+d.name} name={d.name} status={t('workdocs.dialog.unsaved')}/>)}{(items?.length??0)>8&&<p className="text-xs text-ink-2">{t('workdocs.dialog.more',{count:(items?.length??0)-8})}</p>}</>}
  footer={<><Button className="dlg-cancel" onClick={cancelCloseAll}>{t('dialogs.cancel')}</Button><span className="dlg-spacer"/><Button className="dlg-danger" onClick={()=>void resolveCloseAll('discard')}>{t('workdocs.dialog.discard')}</Button><Button variant="primary" autoFocus onClick={()=>void resolveCloseAll('save')}>{t('workdocs.dialog.save')}</Button></>}/>;}
