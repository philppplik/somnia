import {TriangleAlert} from 'lucide-react';
import {Button} from './ui/button';
import {ConfirmShell,FileCard} from './ConfirmShell';
import {useAppStore} from '../store/appStore';
import {useT} from '../lib/useT';
import {cancelClose,runClose} from '../lib/closeFlow';
/** Shown when the window is closed with unsaved changes. Disk projects: Save / Discard / Cancel. Memory projects: keep the draft (restored on next start) / Discard / Cancel. */
export function CloseDialog(){
 const {t}=useT();const s=useAppStore();const kind=s.closePrompt;const disk=kind==='disk';
 return <ConfirmShell open={!!kind} onCancel={cancelClose} alert tone="warning" Icon={TriangleAlert} ariaLabel={t('close.aria')} title={t('close.title')} description={disk?t('close.descDisk'):t('close.descMemory')}
  body={<FileCard name={s.projectName||t('save.thisProject')} status={disk?t('close.statusDisk'):t('close.statusMemory')}/>}
  footer={<><Button className="dlg-cancel" onClick={cancelClose}>{t('dialogs.cancel')}</Button><span className="dlg-spacer"/><Button className="dlg-danger" onClick={()=>kind&&void runClose(kind,'discard')}>{disk?t('close.discardDisk'):t('close.discardMemory')}</Button><Button variant="primary" autoFocus onClick={()=>kind&&void runClose(kind,'save')}>{disk?t('close.saveDisk'):t('close.saveMemory')}</Button></>}/>;}
