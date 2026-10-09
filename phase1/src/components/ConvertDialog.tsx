import {effectiveWorkflow} from '../lib/projectSettingsIO';
import {paperFor} from '../lib/units';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {Check,CircleAlert,File,FileText,Folder,Image,LoaderCircle,Upload,X} from '../lib/icons';
import {patchState,useAppStore} from '../store/appStore';
import {useT} from '../lib/useT';
import {FORMATS,anyTargets,formatLabel,TARGETS,type FormatId} from '../lib/convert/formats';
import {MAX_BATCH_FILES,runBatch,toBatchItem,type BatchItem,type ItemProgress} from '../lib/convert/runner';
import {downloadSink,folderPickerSupported,folderSink,pickOutputFolder} from '../lib/convert/sinks';
import {canvasRasterizer} from '../lib/convert/raster';
import {cn} from '../lib/cn';
const sizeText=(n:number)=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
let seq=0;
interface Row extends BatchItem{error?:string}
/** Convert files: drop or choose files, pick the target format, pick a destination, run the batch. */
export function ConvertPanel({onClose}:{onClose:()=>void}){
 const {t}=useT();
 const [rows,setRows]=useState<Row[]>([]);const [target,setTarget]=useState<FormatId|null>(null);const [quality,setQuality]=useState(92);
 const [folder,setFolder]=useState<FileSystemDirectoryHandle|null>(null);const [progress,setProgress]=useState<Record<string,ItemProgress>>({});
 const [busy,setBusy]=useState(false);const [hover,setHover]=useState(false);const [summary,setSummary]=useState<string|null>(null);const [problems,setProblems]=useState<string[]>([]);
 const abort=useRef<AbortController|null>(null);const input=useRef<HTMLInputElement>(null);const canFolder=folderPickerSupported();
 const formats=rows.map(r=>r.format);const targets=useMemo(()=>anyTargets(formats),[rows]);// eslint-disable-line react-hooks/exhaustive-deps
 const chosen=target&&targets.includes(target)?target:(targets[0]??null);
 const convertible=chosen?rows.filter(r=>TARGETS[r.format].includes(chosen)).length:0;
 const add=useCallback(async(files:readonly File[])=>{
  if(busy||!files.length)return;setSummary(null);setProgress({});
  const bad:string[]=[];const added:Row[]=[];
  const room=Math.max(0,MAX_BATCH_FILES-rows.length);if(files.length>room)bad.push(t('convert.tooMany',{max:MAX_BATCH_FILES}));
  for(const f of files.slice(0,room)){try{added.push(await toBatchItem(f,`cv${++seq}`));}catch(e){bad.push(t('convert.readError',{name:f.name,error:e instanceof Error?e.message:String(e)}));}}
  setProblems(bad);setRows(r=>[...r,...added]);
 },[busy,t,rows.length]);
 // Native desktop drops arrive as a window event (see fileAdapter).
 useEffect(()=>{const h=(e:Event)=>{void add((e as CustomEvent<File[]>).detail);};window.addEventListener('somnia:convert-drop',h);return()=>window.removeEventListener('somnia:convert-drop',h);},[add]);
 const pick=async()=>{try{const h=await pickOutputFolder();if(h)setFolder(h);}catch(e){setProblems([e instanceof Error?e.message:String(e)]);}};
 const run=async()=>{
  if(!chosen||!convertible)return;setBusy(true);setSummary(null);setProblems([]);setProgress({});
  const ac=new AbortController();abort.current=ac;
  try{
   const sink=folder?folderSink(folder):downloadSink();
   const r=await runBatch(rows,{target:chosen,sink,signal:ac.signal,rasterize:canvasRasterizer,quality:quality/100,paper:paperFor(effectiveWorkflow().units,typeof navigator!=='undefined'?navigator.language:undefined),onProgress:p=>setProgress(prev=>({...prev,[p.id]:p}))});
   setSummary(t('convert.summary',{done:r.done,failed:r.failed,skipped:r.skipped}));
   const warn=[...new Set(r.items.flatMap(i=>i.warnings??[]))];if(warn.length)setProblems(warn);
   if(r.done)patchState({notice:t('convert.notice',{count:r.done})});
  }catch(e){setProblems([e instanceof Error?e.message:String(e)]);}finally{abort.current=null;setBusy(false);}
 };
 const finished=Object.values(progress).filter(p=>p.state!=='queued'&&p.state!=='running').length;
 const icon=(f:FormatId)=>f==='unknown'?<CircleAlert size={16}/>:FORMATS[f].kind==='image'?<Image size={16}/>:FORMATS[f].kind==='text'?<FileText size={16}/>:<File size={16}/>;
 const stateIcon=(p?:ItemProgress)=>p?.state==='running'?<LoaderCircle size={14} className="cv-spin"/>:p?.state==='done'?<Check size={14}/>:p&&(p.state==='failed'||p.state==='skipped')?<CircleAlert size={14}/>:null;
 const onDrop=(e:React.DragEvent)=>{e.preventDefault();e.stopPropagation();setHover(false);void add([...e.dataTransfer.files]);};
 return <>
  <header className="export-head">
   <DialogTitle>{t('convert.title')}</DialogTitle>
   <DialogDescription>{t('convert.desc')}</DialogDescription>
   <button type="button" className="export-close" aria-label={t('set.close.aria')} title={t('set.close')} onClick={onClose} disabled={busy}><X size={16}/></button>
  </header>
  <div className="export-body cv-body">
   <div className="cv-drop" data-hover={hover} onDragOver={e=>{e.preventDefault();setHover(true);}} onDragEnter={e=>{e.preventDefault();setHover(true);}} onDragLeave={()=>setHover(false)} onDrop={onDrop}>
    <Upload size={22}/><strong>{t('convert.drop')}</strong>
    <Button size="compact" variant="outline" disabled={busy} onClick={()=>input.current?.click()}>{rows.length?t('convert.addMore'):t('convert.choose')}</Button>
    <input ref={input} type="file" multiple hidden aria-label={t('convert.choose')} data-testid="convert-input" onChange={e=>{const f=[...(e.target.files??[])];e.target.value='';void add(f);}}/>
   </div>
   {rows.length>0&&<ul className="cv-list" aria-label={t('convert.files')}>
    {rows.map(r=>{const p=progress[r.id];return <li key={r.id} className="cv-row" data-state={p?.state??'idle'}>
     <span className="cv-file-icon" aria-hidden="true">{icon(r.format)}</span>
     <span className="cv-name"><strong title={r.name}>{r.name}</strong><span>{r.format==='unknown'?t('convert.unknown'):formatLabel(r.format)} · {sizeText(r.bytes.length)}{chosen&&r.format!=='unknown'&&!TARGETS[r.format].includes(chosen)?` · ${t('convert.state.skipped')}`:''}</span>{p?.error&&<span className="cv-err">{p.error}</span>}{p?.outputName&&<span>{p.outputName}</span>}</span>
     <span className="cv-state" role="status" aria-label={p?t(`convert.state.${p.state}`):undefined}>{stateIcon(p)}</span>
     <button type="button" className="cv-remove" aria-label={t('convert.remove',{name:r.name})} title={t('convert.removeShort')} disabled={busy} onClick={()=>{setRows(x=>x.filter(y=>y.id!==r.id));setProgress({});setSummary(null);}}><X size={14}/></button>
    </li>;})}
   </ul>}
   {rows.length>0&&<section className="cv-section">
    <h3>{t('convert.target')}</h3>
    {targets.length?<div className="cv-chips" role="radiogroup" aria-label={t('convert.target')}>{targets.map(f=><label key={f} className="cv-chip" data-checked={chosen===f}><input type="radio" name="convert-target" aria-label={formatLabel(f)} checked={chosen===f} disabled={busy} onChange={()=>setTarget(f)}/>{formatLabel(f)}</label>)}</div>:<p className="cv-note">{t('convert.noTarget')}</p>}
    {chosen&&convertible<rows.length&&<p className="cv-note">{t('convert.willSkip',{count:rows.length-convertible,format:formatLabel(chosen)})}</p>}
    {chosen&&(chosen==='jpg'||chosen==='webp')&&<label className="cv-quality">{t('convert.quality')}<input type="range" min={10} max={100} step={1} value={quality} disabled={busy} aria-valuetext={`${quality}%`} onChange={e=>setQuality(+e.target.value)}/><output>{quality}%</output></label>}
   </section>}
   {rows.length>0&&<section className="cv-section">
    <h3>{t('convert.dest')}</h3>
    <div className="cv-dest">
     {canFolder?<><Button size="compact" variant="outline" disabled={busy} onClick={()=>void pick()}><Folder size={14}/>{folder?t('convert.changeFolder'):t('convert.pickFolder')}</Button>{folder&&<Button size="compact" disabled={busy} onClick={()=>setFolder(null)}>{t('convert.useDownload')}</Button>}<span className="cv-note" data-testid="convert-dest">{folder?t('convert.destFolder',{name:folder.name}):t('convert.destDownload')}</span></>:<span className="cv-note" data-testid="convert-dest">{t('convert.destNoFolder')}</span>}
    </div>
   </section>}
   {busy&&<div className="cv-progress"><progress max={rows.length} value={finished} aria-label={t('convert.running',{done:finished,total:rows.length})}/><span role="status">{t('convert.running',{done:finished,total:rows.length})}</span></div>}
   {summary&&<p role="status" className="cv-summary">{summary}</p>}
   {rows.length===1&&FORMATS[rows[0].format as Exclude<FormatId,'unknown'>]?.kind==='image'&&!busy&&<Button size="compact" variant="outline" onClick={()=>{const r=rows[0];const f=new globalThis.File([r.bytes as Uint8Array<ArrayBuffer>],r.name);onClose();window.dispatchEvent(new CustomEvent('somnia:convert-image',{detail:f}));}}>{t('convert.imageOptions')}</Button>}
   {problems.map((p,i)=><p key={i} role="alert" className="export-error">{p}</p>)}
  </div>
  <footer className="export-foot">
   {rows.length>0&&!busy&&<Button onClick={()=>{setRows([]);setProgress({});setSummary(null);setProblems([]);}}>{t('convert.clear')}</Button>}
   <Button onClick={()=>busy?abort.current?.abort():onClose()}>{busy?t('convert.stop'):t('convert.close')}</Button>
   <Button variant="primary" onClick={()=>void run()} disabled={busy||!chosen||!convertible}>{t('convert.start',{format:chosen?formatLabel(chosen):'…'})}</Button>
  </footer>
 </>;}
export function ConvertDialog(){
 const {t}=useT();const s=useAppStore();
 return <Dialog open={s.convertDialog} onOpenChange={o=>{if(!o)patchState({convertDialog:false});}}><DialogContent className={cn('export-popup','cv-popup')} aria-label={t('convert.aria')}><ConvertPanel onClose={()=>patchState({convertDialog:false})}/></DialogContent></Dialog>;}
