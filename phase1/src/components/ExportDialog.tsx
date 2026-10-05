import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {patchState,useAppStore} from '../store/appStore';
import {downloadMarkdown,downloadProject,downloadText,singleFileHtml} from '../lib/exportProject';
import {useT} from '../lib/useT';
import {getSaveHandlers} from '../lib/saveFlow';
type Kind='zip'|'folder'|'single'|'markdown';
/** Export Project: choose the format and options, then export. A copy only: the open project and its save state do not change. */
export function ExportDialog(){
 const {t}=useT();const s=useAppStore();const [kind,setKind]=useState<Kind>('zip');const [css,setCss]=useState(true);const [js,setJs]=useState(true);const [sub,setSub]=useState(true);const [err,setErr]=useState<string|null>(null);const [busy,setBusy]=useState(false);
 const htmls=Object.keys(s.files).filter(f=>/\.html?$/i.test(f));const [page,setPage]=useState('');const target=htmls.includes(page)?page:(htmls.includes(s.designFile)?s.designFile:htmls[0]??'');
 const close=()=>patchState({exportDialog:false});const name=s.projectName||'somnia-project';
 const run=async()=>{setErr(null);setBusy(true);try{
  if(kind==='zip'){downloadProject(s.files,name);patchState({notice:t('export.zipRequested')});close();}
  else if(kind==='single'){if(!target)throw Error(t('export.noHtml'));downloadText(singleFileHtml(s.files,target,{css,js}),target.split('/').pop()!);patchState({notice:t('export.singleDone',{target})});close();}
  else if(kind==='markdown'){downloadMarkdown(s.files,target);close();}
  else{const h=getSaveHandlers();if(!h?.exportFolder)throw Error(t('export.needFolder'));if(await h.exportFolder(sub))close();}
 }catch(e){setErr(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const opt=(k:Kind,title:string,text:string)=><label className="flex cursor-pointer items-start gap-2 rounded-md border border-subtle p-2 text-[12px]"><input type="radio" name="export-kind" aria-label={title} checked={kind===k} onChange={()=>setKind(k)} className="mt-1"/><span><strong className="text-ink">{title}</strong><br/><span className="text-ink-2">{text}</span></span></label>;
 return <Dialog open={s.exportDialog} onOpenChange={o=>{if(!o&&!busy)close();}}><DialogContent className="confirm-dialog" aria-label={t('export.aria')}>
  <DialogTitle>{t('export.title')}</DialogTitle>
  <DialogDescription>{t('export.desc',{name})}</DialogDescription>
  <div className="mt-3 grid gap-2">
   {opt('zip',t('export.zip'),t('export.zipDesc'))}
   {opt('folder',t('export.folder'),t('export.folderDesc'))}
   {opt('single',t('export.single'),t('export.singleDesc'))}
   {opt('markdown',t('export.markdown'),t('export.markdownDesc'))}
  </div>
  {(kind==='single'||kind==='markdown')&&htmls.length>0&&<label className="mt-3 flex items-center gap-2 text-[12px]">{t('export.page')}<select aria-label={t('export.pageAria')} value={target} onChange={e=>setPage(e.target.value)} className="h-7 rounded-sm border border-subtle bg-panel px-2 text-ink">{htmls.map(h=><option key={h}>{h}</option>)}</select></label>}
  {kind==='single'&&<div className="mt-2 flex gap-4 text-[12px]"><label className="flex items-center gap-1"><input type="checkbox" checked={css} onChange={e=>setCss(e.target.checked)}/>{t('export.inlineCss')}</label><label className="flex items-center gap-1"><input type="checkbox" checked={js} onChange={e=>setJs(e.target.checked)}/>{t('export.inlineJs')}</label></div>}
  {kind==='folder'&&<label className="mt-2 flex items-center gap-1 text-[12px]"><input type="checkbox" checked={sub} onChange={e=>setSub(e.target.checked)}/>{t('save.newFolder',{name})}</label>}
  {err&&<p role="alert" className="mt-2 text-[12px] text-red-500">{err}</p>}
  <div className="mt-4 flex justify-end gap-2"><Button onClick={close} disabled={busy}>{t('dialogs.cancel')}</Button><Button autoFocus onClick={()=>void run()} disabled={busy||!s.coreConnected}>{busy?t('export.exporting'):t('export.export')}</Button></div>
 </DialogContent></Dialog>;}
