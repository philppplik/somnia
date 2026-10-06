import {TriangleAlert} from 'lucide-react';
import {Button} from './ui/button';
import {ConfirmShell,FileCard} from './ConfirmShell';
import {patchState,useAppStore} from '../store/appStore';
import {closeMemoryProject} from '../lib/projectActions';
import {useT} from '../lib/useT';
import {executeCommand} from '../lib/commands';
/** Close Project on an in-memory project with unsaved changes. */
export function CloseProjectDialog(){
 const {t}=useT();const s=useAppStore();const open=s.closeProjectPrompt;const done=()=>patchState({closeProjectPrompt:false});
 return <ConfirmShell open={open} onCancel={done} alert tone="warning" Icon={TriangleAlert} ariaLabel={t('closeProject.aria')} title={t('closeProject.title')} description={t('closeProject.desc')}
  body={<FileCard name={s.projectName||t('save.thisProject')} status={t('close.statusMemory')}/>}
  footer={<><Button className="dlg-cancel" onClick={done}>{t('dialogs.cancel')}</Button><span className="dlg-spacer"/><Button className="dlg-danger" onClick={()=>{done();closeMemoryProject();}}>{t('closeProject.discard')}</Button><Button variant="primary" autoFocus onClick={()=>{done();void executeCommand('project.save');}}>{t('closeProject.save')}</Button></>}/>;}
