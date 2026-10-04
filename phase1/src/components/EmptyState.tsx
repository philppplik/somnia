import {FolderOpen,FileText,FilePlus2} from 'lucide-react';
import {executeCommand} from '../lib/commands';
import {Button} from './ui/button';
/** Shown instead of the editor while no project is open. */
export function EmptyState(){
 return <main className="center" aria-label="Editor workspace"><div className="flex h-full w-full flex-col items-center justify-center gap-5 rounded-lg border border-subtle bg-panel p-8 text-center" data-testid="empty-state">
  <div><h1 className="m-0 text-[18px] font-semibold text-ink">Open something to start</h1>
  <p className="mx-auto mt-2 max-w-[420px] text-[13px] text-ink-2">Somnia works on your own files. Open a project folder, open a single file, or start a blank page. You can also drag files from your file manager into this window.</p></div>
  <div className="flex flex-wrap justify-center gap-2">
   <Button autoFocus onClick={()=>void executeCommand('project.open')}><FolderOpen size={14}/>Open folder</Button>
   <Button onClick={()=>void executeCommand('project.openFile')}><FileText size={14}/>Open file</Button>
   <Button onClick={()=>void executeCommand('project.newFile')}><FilePlus2 size={14}/>New blank page</Button>
  </div>
  <p className="text-[11px] text-ink-3">Ctrl+O opens a folder, Ctrl+K shows all commands.</p>
 </div></main>;}
