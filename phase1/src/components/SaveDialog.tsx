import {useState} from 'react';
import {Save} from 'lucide-react';
import {Button} from './ui/button';
import {ConfirmShell,FileCard} from './ConfirmShell';
import {useAppStore} from '../store/appStore';
import {useT} from '../lib/useT';
import {folderNameFor} from '../lib/folderName';
import {cancelSave,runChooseFolder,runDownload} from '../lib/saveFlow';
/** Ctrl+S on a project that is not stored anywhere yet (new project): save it into a folder or download a ZIP. */
export function SaveDialog(){
 const {t}=useT();const [sub,setSub]=useState(true);const s=useAppStore();const d=s.saveDialog;const n=Object.keys(s.files).length;const busy=!!d?.busy;
 const name=s.projectName||t('save.thisProject');
 return <ConfirmShell open={!!d} onCancel={cancelSave} busy={busy} tone="accent" Icon={Save} ariaLabel={t('save.aria')} title={t('save.title')} description={t('save.desc',{count:n})}
  body={<>
   <FileCard name={name} status={t('save.cardStatus',{count:n})}/>
   <label className="dlg-option"><span className="dlg-option-text"><span>{t('save.newFolder')}</span><small>{t('save.newFolderHint',{slug:folderNameFor(s.projectName)})}</small></span>
    <input type="checkbox" aria-label={t('save.newFolderAria')} checked={sub} disabled={busy} onChange={e=>setSub(e.target.checked)}/></label>
   {d?.error&&<p role="alert" className="dlg-error" data-testid="save-error">{d.error}</p>}
   <button type="button" className="dlg-link" onClick={runDownload} disabled={busy}>{t('save.zip')}</button>
  </>}
  footer={<><span className="dlg-spacer"/><Button className="dlg-cancel" onClick={cancelSave} disabled={busy}>{t('dialogs.cancel')}</Button><Button variant="primary" autoFocus onClick={()=>void runChooseFolder(sub)} disabled={busy}>{busy?t('save.saving'):t('save.choose')}</Button></>}/>;}
