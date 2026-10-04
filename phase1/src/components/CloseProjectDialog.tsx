import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {patchState,useAppStore} from '../store/appStore';
import {closeMemoryProject} from '../lib/projectActions';
import {executeCommand} from '../lib/commands';
/** Close Project on an in-memory project with unsaved changes. */
export function CloseProjectDialog(){
 const open=useAppStore().closeProjectPrompt;const done=()=>patchState({closeProjectPrompt:false});
 return <Dialog open={open} onOpenChange={o=>{if(!o)done();}}><DialogContent className="confirm-dialog" aria-label="Close project">
  <DialogTitle>Close this project?</DialogTitle>
  <DialogDescription>It is not saved to a folder yet. Save it first, or discard the changes.</DialogDescription>
  <div className="mt-4 flex justify-end gap-2"><Button onClick={done}>Cancel</Button><Button onClick={()=>{done();closeMemoryProject();}}>Discard and close</Button><Button autoFocus onClick={()=>{done();void executeCommand('project.save');}}>Save...</Button></div>
 </DialogContent></Dialog>;}
