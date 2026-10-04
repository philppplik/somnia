import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {useAppStore} from '../store/appStore';
import {cancelClose,runClose} from '../lib/closeFlow';
/** Shown when the window is closed with unsaved changes. Disk projects: Save / Discard / Cancel. Memory projects: keep the draft (restored on next start) / Discard / Cancel. */
export function CloseDialog(){
 const s=useAppStore();const kind=s.closePrompt;
 return <Dialog open={!!kind} onOpenChange={o=>{if(!o)cancelClose();}}><DialogContent aria-label="Unsaved changes">
  <DialogTitle>You have unsaved changes</DialogTitle>
  <DialogDescription>{kind==='disk'?'Save them to your folder before closing, or discard them. Discarded edits stay in recovery and can be restored when you reopen the folder.':'This project is not saved to a folder. Keep a draft to restore it the next time Somnia starts, or discard it.'}</DialogDescription>
  <div className="mt-4 flex justify-end gap-2">
   <Button onClick={cancelClose}>Cancel</Button>
   <Button onClick={()=>kind&&void runClose(kind,'discard')}>{kind==='disk'?'Discard and close':'Discard draft and close'}</Button>
   <Button autoFocus onClick={()=>kind&&void runClose(kind,'save')}>{kind==='disk'?'Save and close':'Keep draft and close'}</Button>
  </div></DialogContent></Dialog>;}
