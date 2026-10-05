import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {patchState,useAppStore} from '../store/appStore';
import {downloadMarkdown,downloadProject,downloadText,singleFileHtml} from '../lib/exportProject';
import {getSaveHandlers} from '../lib/saveFlow';
type Kind='zip'|'folder'|'single'|'markdown';
/** Export Project: choose the format and options, then export. A copy only: the open project and its save state do not change. */
export function ExportDialog(){
 const s=useAppStore();const [kind,setKind]=useState<Kind>('zip');const [css,setCss]=useState(true);const [js,setJs]=useState(true);const [sub,setSub]=useState(true);const [err,setErr]=useState<string|null>(null);const [busy,setBusy]=useState(false);
 const htmls=Object.keys(s.files).filter(f=>/\.html?$/i.test(f));const [page,setPage]=useState('');const target=htmls.includes(page)?page:(htmls.includes(s.designFile)?s.designFile:htmls[0]??'');
 const close=()=>patchState({exportDialog:false});const name=s.projectName||'somnia-project';
 const run=async()=>{setErr(null);setBusy(true);try{
  if(kind==='zip'){downloadProject(s.files,name);patchState({notice:'ZIP download requested.'});close();}
  else if(kind==='single'){if(!target)throw Error('This project has no HTML page.');downloadText(singleFileHtml(s.files,target,{css,js}),target.split('/').pop()!);patchState({notice:`Exported ${target} as a single file.`});close();}
  else if(kind==='markdown'){downloadMarkdown(s.files,target);close();}
  else{const h=getSaveHandlers();if(!h?.exportFolder)throw Error('Folder export needs the desktop app or a browser with folder access.');if(await h.exportFolder(sub))close();}
 }catch(e){setErr(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const opt=(k:Kind,title:string,text:string)=><label className="flex cursor-pointer items-start gap-2 rounded-md border border-subtle p-2 text-[12px]"><input type="radio" name="export-kind" aria-label={title} checked={kind===k} onChange={()=>setKind(k)} className="mt-1"/><span><strong className="text-ink">{title}</strong><br/><span className="text-ink-2">{text}</span></span></label>;
 return <Dialog open={s.exportDialog} onOpenChange={o=>{if(!o&&!busy)close();}}><DialogContent className="confirm-dialog" aria-label="Export project">
  <DialogTitle>Export project</DialogTitle>
  <DialogDescription>Make a copy of {name}. Your open project and its save state stay as they are.</DialogDescription>
  <div className="mt-3 grid gap-2">
   {opt('zip','ZIP archive','All files in one .zip download.')}
   {opt('folder','Folder','Copy all files into a folder on disk. Existing files are never overwritten.')}
   {opt('single','Single HTML file','One page with local CSS and scripts inlined.')}
   {opt('markdown','Markdown','The page text as a .md file.')}
  </div>
  {(kind==='single'||kind==='markdown')&&htmls.length>0&&<label className="mt-3 flex items-center gap-2 text-[12px]">Page<select aria-label="Page to export" value={target} onChange={e=>setPage(e.target.value)} className="h-7 rounded-sm border border-subtle bg-panel px-2 text-ink">{htmls.map(h=><option key={h}>{h}</option>)}</select></label>}
  {kind==='single'&&<div className="mt-2 flex gap-4 text-[12px]"><label className="flex items-center gap-1"><input type="checkbox" checked={css} onChange={e=>setCss(e.target.checked)}/>Inline CSS</label><label className="flex items-center gap-1"><input type="checkbox" checked={js} onChange={e=>setJs(e.target.checked)}/>Inline scripts</label></div>}
  {kind==='folder'&&<label className="mt-2 flex items-center gap-1 text-[12px]"><input type="checkbox" checked={sub} onChange={e=>setSub(e.target.checked)}/>Create a new folder named {name} inside the chosen folder</label>}
  {err&&<p role="alert" className="mt-2 text-[12px] text-red-500">{err}</p>}
  <div className="mt-4 flex justify-end gap-2"><Button onClick={close} disabled={busy}>Cancel</Button><Button autoFocus onClick={()=>void run()} disabled={busy||!s.coreConnected}>{busy?'Exporting...':'Export'}</Button></div>
 </DialogContent></Dialog>;}
