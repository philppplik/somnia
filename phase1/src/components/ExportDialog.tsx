import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {FileArchive,FileCode2,FileText,FolderOpen,X} from 'lucide-react';
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
 const icons={zip:FileArchive,folder:FolderOpen,single:FileCode2,markdown:FileText} as const;
 const opt=(k:Kind,title:string,text:string)=>{const Icon=icons[k];return <label className="export-option" data-checked={kind===k}><input type="radio" name="export-kind" aria-label={title} checked={kind===k} onChange={()=>setKind(k)}/><span className="export-option-icon" aria-hidden="true"><Icon size={18}/></span><span className="export-option-text"><strong>{title}</strong><span>{text}</span></span></label>;};
 return <Dialog open={s.exportDialog} onOpenChange={o=>{if(!o&&!busy)close();}}><DialogContent className="export-popup" aria-label={t('export.aria')}>
  <header className="export-head">
   <DialogTitle>{t('export.title')}</DialogTitle>
   <DialogDescription>{t('export.desc',{name})}</DialogDescription>
   <button type="button" className="export-close" aria-label={t('set.close.aria')} title={t('set.close')} onClick={close} disabled={busy}><X size={16}/></button>
  </header>
  <div className="export-body">
   <div className="export-options" role="radiogroup" aria-label={t('export.title')}>
    {opt('zip',t('export.zip'),t('export.zipDesc'))}
    {opt('folder',t('export.folder'),t('export.folderDesc'))}
    {opt('single',t('export.single'),t('export.singleDesc'))}
    {opt('markdown',t('export.markdown'),t('export.markdownDesc'))}
   </div>
   {((kind==='single'||kind==='markdown')&&htmls.length>0||kind==='single'||kind==='folder')&&<div className="export-rows">
    {(kind==='single'||kind==='markdown')&&htmls.length>0&&<label>{t('export.page')}<select aria-label={t('export.pageAria')} value={target} onChange={e=>setPage(e.target.value)}>{htmls.map(h=><option key={h}>{h}</option>)}</select></label>}
    {kind==='single'&&<><label>{t('export.inlineCss')}<input type="checkbox" checked={css} onChange={e=>setCss(e.target.checked)}/></label><label>{t('export.inlineJs')}<input type="checkbox" checked={js} onChange={e=>setJs(e.target.checked)}/></label></>}
    {kind==='folder'&&<label>{t('save.newFolder',{name})}<input type="checkbox" checked={sub} onChange={e=>setSub(e.target.checked)}/></label>}
   </div>}
   {err&&<p role="alert" className="export-error">{err}</p>}
  </div>
  <footer className="export-foot"><Button onClick={close} disabled={busy}>{t('dialogs.cancel')}</Button><Button variant="primary" autoFocus onClick={()=>void run()} disabled={busy||!s.coreConnected}>{busy?t('export.exporting'):t('export.export')}</Button></footer>
 </DialogContent></Dialog>;}
