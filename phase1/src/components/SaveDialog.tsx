import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {useAppStore} from '../store/appStore';
import {useT} from '../lib/useT';
import {cancelSave,runChooseFolder,runDownload} from '../lib/saveFlow';
/** Ctrl+S on a project that is not stored anywhere yet (Starter, new project): save it into a folder or download a ZIP. */
export function SaveDialog(){
 const {t}=useT();const [sub,setSub]=useState(true);const s=useAppStore();const d=s.saveDialog;const n=Object.keys(s.files).length;
 return <Dialog open={!!d} onOpenChange={o=>{if(!o&&!d?.busy)cancelSave();}}><DialogContent className="confirm-dialog" aria-label={t('save.aria')}>
  <DialogTitle>{t('save.title')}</DialogTitle>
  <DialogDescription>{t('save.desc',{name:s.projectName||t('save.thisProject'),count:n})}</DialogDescription>
  <label className="mt-3 flex items-center gap-2 text-[12px]"><input type="checkbox" aria-label={t('save.newFolderAria')} checked={sub} onChange={e=>setSub(e.target.checked)}/>{t('save.newFolder',{name:s.projectName||'somnia-project'})}</label>
  {d?.error&&<p role="alert" className="mt-2 text-[12px] text-red-500" data-testid="save-error">{d.error}</p>}
  <div className="mt-4 flex justify-end gap-2">
   <Button onClick={cancelSave} disabled={d?.busy}>{t('dialogs.cancel')}</Button>
   <Button onClick={runDownload} disabled={d?.busy}>{t('save.zip')}</Button>
   <Button autoFocus onClick={()=>void runChooseFolder(sub)} disabled={d?.busy}>{d?.busy?t('save.saving'):t('save.choose')}</Button>
  </div></DialogContent></Dialog>;}
