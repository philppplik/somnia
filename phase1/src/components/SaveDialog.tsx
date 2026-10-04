import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {useAppStore} from '../store/appStore';
import {cancelSave,runChooseFolder,runDownload} from '../lib/saveFlow';
/** Ctrl+S on a project that is not stored anywhere yet (Starter, new project): save it into a folder or download a ZIP. */
export function SaveDialog(){
 const s=useAppStore();const d=s.saveDialog;const n=Object.keys(s.files).length;
 return <Dialog open={!!d} onOpenChange={o=>{if(!o&&!d?.busy)cancelSave();}}><DialogContent aria-label="Save project">
  <DialogTitle>Save project</DialogTitle>
  <DialogDescription>{s.projectName||'This project'} has {n} file{n===1?'':'s'} and is not saved anywhere yet. Choose a folder to save them into (an empty folder is best, nothing is overwritten). Somnia then keeps that folder saved automatically.</DialogDescription>
  {d?.error&&<p role="alert" className="mt-2 text-[12px] text-red-500" data-testid="save-error">{d.error}</p>}
  <div className="mt-4 flex justify-end gap-2">
   <Button onClick={cancelSave} disabled={d?.busy}>Cancel</Button>
   <Button onClick={runDownload} disabled={d?.busy}>Download ZIP instead</Button>
   <Button autoFocus onClick={()=>void runChooseFolder()} disabled={d?.busy}>{d?.busy?'Saving...':'Choose folder and save'}</Button>
  </div></DialogContent></Dialog>;}
