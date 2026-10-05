import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {patchState,useAppStore} from '../store/appStore';
import {closeMemoryProject} from '../lib/projectActions';
import {useT} from '../lib/useT';
import {executeCommand} from '../lib/commands';
/** Close Project on an in-memory project with unsaved changes. */
export function CloseProjectDialog(){
 const {t}=useT();const open=useAppStore().closeProjectPrompt;const done=()=>patchState({closeProjectPrompt:false});
 return <Dialog open={open} onOpenChange={o=>{if(!o)done();}}><DialogContent className="confirm-dialog" aria-label={t('closeProject.aria')}>
  <DialogTitle>{t('closeProject.title')}</DialogTitle>
  <DialogDescription>{t('closeProject.desc')}</DialogDescription>
  <div className="mt-4 flex justify-end gap-2"><Button onClick={done}>{t('dialogs.cancel')}</Button><Button onClick={()=>{done();closeMemoryProject();}}>{t('closeProject.discard')}</Button><Button autoFocus onClick={()=>{done();void executeCommand('project.save');}}>{t('closeProject.save')}</Button></div>
 </DialogContent></Dialog>;}
