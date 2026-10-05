import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {useAppStore} from '../store/appStore';
import {useT} from '../lib/useT';
import {cancelClose,runClose} from '../lib/closeFlow';
/** Shown when the window is closed with unsaved changes. Disk projects: Save / Discard / Cancel. Memory projects: keep the draft (restored on next start) / Discard / Cancel. */
export function CloseDialog(){
 const {t}=useT();const s=useAppStore();const kind=s.closePrompt;
 return <Dialog open={!!kind} onOpenChange={o=>{if(!o)cancelClose();}}><DialogContent className="confirm-dialog" aria-label={t('close.aria')}>
  <DialogTitle>{t('close.title')}</DialogTitle>
  <DialogDescription>{kind==='disk'?t('close.descDisk'):t('close.descMemory')}</DialogDescription>
  <div className="mt-4 flex justify-end gap-2">
   <Button onClick={cancelClose}>{t('dialogs.cancel')}</Button>
   <Button onClick={()=>kind&&void runClose(kind,'discard')}>{kind==='disk'?t('close.discardDisk'):t('close.discardMemory')}</Button>
   <Button autoFocus onClick={()=>kind&&void runClose(kind,'save')}>{kind==='disk'?t('close.saveDisk'):t('close.saveMemory')}</Button>
  </div></DialogContent></Dialog>;}
