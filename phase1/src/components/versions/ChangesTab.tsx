import {useEffect,useRef,useSyncExternalStore} from 'react';
import type {GitBackend} from '../../lib/git/types';
import {useT} from '../../lib/useT';
import {cn} from '../../lib/cn';
import {Button} from '../ui/button';
import {ChangesController,blockedKey,errorKey,type ChangesState} from './controller';
import {isSelectable,kindGlyph,kindKey} from './selection';
import {withGit} from './vocab';
import {TrustRepo} from './TrustRepo';

export interface ChangesTabProps{
 backend:GitBackend;
 /** Number of files with edits in the editor that are not on disk yet. The backend only sees disk. */
 unsavedFiles:number;
 /** Saves editor buffers to disk (the app's project.save). */
 onSaveFiles:()=>Promise<void>|void;
 advanced:boolean;
 /** Called after a version was saved, so History can reload. */
 onVersionSaved?:()=>void;
 /** Test hook: use an existing controller. */
 controller?:ChangesController;
}
/** Controller is recreated only when the backend changes; translate updates flow through setTranslate. */
export function useChangesController(backend:GitBackend,given?:ChangesController){
 const {t}=useT();const ref=useRef<{b:GitBackend;c:ChangesController}|null>(null);
 if(given)return given;
 if(!ref.current||ref.current.b!==backend)ref.current={b:backend,c:new ChangesController(backend,t)};
 return ref.current.c;}

export function ChangesTab({backend,unsavedFiles,onSaveFiles,advanced,onVersionSaved,controller}:ChangesTabProps){
 const {t}=useT();const c=useChangesController(backend,controller);
 c.setTranslate(t);
 const s=useSyncExternalStore(c.subscribe,c.getState,c.getState);
 useEffect(()=>{void c.refresh();},[c]);
 const saveFirst=async()=>{await onSaveFiles();await c.refresh();};
 return <ChangesView backend={backend} s={s} c={c} t={t} unsavedFiles={unsavedFiles} advanced={advanced} onSaveFiles={saveFirst} onSaved={onVersionSaved}/>;}

type T=(k:string,p?:Record<string,string|number>)=>string;
const btn='h-8 rounded-sm border border-subtle bg-transparent px-3 text-xs text-ink-2 disabled:opacity-40';
/** Pure view of a controller state (also used by the SSR tests). */
export function ChangesView({backend,s,c,t,unsavedFiles,advanced,onSaveFiles,onSaved}:{backend?:GitBackend;s:ChangesState;c:ChangesController;t:T;unsavedFiles:number;advanced:boolean;onSaveFiles:()=>void;onSaved?:()=>void}){
 const errMsg=s.error?<div role="alert" data-testid="versions-error" className="rounded-sm border border-subtle p-2 text-[11px] text-ink">{t(errorKey(s.error.code))}{advanced&&s.error.detail&&<details className="mt-1"><summary>{t('versions.error.detail')}</summary><pre className="whitespace-pre-wrap break-words font-mono text-[10px]">{s.error.detail}</pre></details>}</div>:null;
 if(s.phase==='loading')return <div className="p-4 text-xs text-ink-3" role="status" data-testid="versions-loading">{t('versions.loading')}</div>;
 if(s.phase==='repo'&&s.repoState){const st=s.repoState;
  return <div className="flex flex-col gap-3 p-4 text-xs" data-testid="versions-state">
   <p role="status" className="leading-[1.7] text-ink-2">{t(blockedKey(st))}</p>
   {st.kind==='no-repo'&&<><p className="text-[11px] text-ink-3">{t('versions.init.hint')}</p><Button variant="primary" size="normal" disabled={s.busy==='init'} onClick={()=>void c.init()} data-testid="versions-init">{withGit(t('versions.init'),'git init',advanced)}</Button></>}
   {st.kind==='blocked'&&st.reason==='untrusted-repo'&&backend&&<TrustRepo t={t} onTrust={async()=>{await backend.trustRepo();await c.refresh();}}/>}
   {st.kind==='blocked'&&<Button className={btn} onClick={()=>void c.refresh()}>{t('versions.refresh')}</Button>}
   {errMsg}</div>;}
 if(s.phase==='error'||!s.status)return <div className="flex flex-col gap-3 p-4 text-xs" data-testid="versions-state">{errMsg}<Button className={btn} onClick={()=>void c.refresh()}>{t('versions.refresh')}</Button></div>;
 const repo=s.status.repo;const list=c.visible();const sel=s.selected.size;const selectable=list.filter(isSelectable);const allOn=selectable.length>0&&selectable.every(x=>s.selected.has(x.path));
 const warnings=[repo.hasLfs&&'versions.warn.lfs',repo.hasSubmodules&&'versions.warn.submodules',repo.detached&&'versions.warn.detached',repo.projectPrefix&&'versions.warn.prefix'].filter(Boolean) as string[];
 const saving=s.busy==='commit';
 return <div className="flex h-full min-h-0 flex-col gap-2 p-3 text-xs" data-testid="versions-changes">
  {warnings.map(k=><p key={k} role="note" className="rounded-sm border border-subtle p-2 text-[11px] text-ink-2">{t(k)}</p>)}
  {unsavedFiles>0&&<div role="alert" data-testid="versions-unsaved" className="flex flex-col gap-2 rounded-sm border border-subtle p-2 text-[11px] text-ink"><span>{t('versions.unsaved.banner',{count:unsavedFiles})}</span><button className={btn} onClick={onSaveFiles}>{t('versions.unsaved.save')}</button></div>}
  <div className="flex items-center gap-2"><h3 className="m-0 flex-1 text-[11px] font-medium text-ink-2">{t('versions.changes.heading')}</h3>
   {advanced&&<span className="font-mono text-[10px] text-ink-3" data-testid="versions-branch">{repo.branch??'HEAD'}</span>}
   <button className="h-6 rounded-sm border border-subtle bg-transparent px-2 text-[11px] text-ink-2" disabled={!!s.busy} onClick={()=>void c.refresh()}>{t('versions.refresh')}</button></div>
  {list.length===0?<p className="py-6 text-center text-ink-3" data-testid="versions-none">{t('versions.changes.none')}</p>:<>
   <div className="flex items-center gap-2"><label className="flex items-center gap-2 whitespace-nowrap text-[11px] text-ink-2"><input type="checkbox" className="size-4 shrink-0 grow-0 basis-4" checked={allOn} onChange={e=>c.selectAll(e.target.checked)} aria-label={allOn?t('versions.selectNone'):t('versions.selectAll')}/>{allOn?t('versions.selectNone'):t('versions.selectAll')}</label><span className="flex-1"/><span className="text-[11px] text-ink-3" aria-live="polite">{t('versions.selected',{count:sel})}</span></div>
   <ul className="m-0 min-h-0 flex-1 list-none overflow-auto p-0" aria-label={t('versions.changes.heading')}>
    {list.map(ch=>{const ok=isSelectable(ch);const id=`vc-${ch.path}`;return <li key={ch.path} className="flex items-start gap-2 border-b border-subtle py-1.5" data-testid="versions-file">
     <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 grow-0 basis-4" disabled={!ok} checked={s.selected.has(ch.path)} onChange={()=>c.toggle(ch.path)} aria-label={t('versions.file.include',{file:ch.path})} aria-describedby={`${id}-d`}/>
     <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer"><span className="block break-all text-ink" dir="auto">{ch.path}</span>
      <span id={`${id}-d`} className="flex flex-wrap gap-x-2 text-[10px] text-ink-3"><span><span aria-hidden="true" className="font-mono">{kindGlyph(ch.kind)} </span>{withGit(t(kindKey(ch.kind)),ch.kind,advanced)}</span>{ch.oldPath&&<span>{t('versions.file.renamedFrom',{from:ch.oldPath})}</span>}{ch.binary&&<span>{t('versions.file.binary')}</span>}{ch.suggestSkip&&<span>{t('versions.file.skip')}</span>}{ch.kind==='conflicted'&&<span>{t('versions.file.conflicted')}</span>}{advanced&&ch.staged&&<span>staged</span>}</span></label></li>;})}
   </ul>
   {s.status.truncated&&<p className="text-[11px] text-ink-3">{t('versions.truncated')}</p>}</>}
  <div className="flex flex-col gap-2">
   <label className="flex flex-col gap-1 text-[11px] text-ink-2">{withGit(t('versions.subject.label'),'commit message',advanced)}<input data-testid="versions-subject" value={s.subject} maxLength={200} placeholder={t('versions.subject.placeholder')} onChange={e=>c.setSubject(e.target.value)} className="h-8 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink"/></label>
   {!s.subjectTouched&&s.subject&&<p className="m-0 text-[10px] text-ink-3">{t('versions.subject.suggested')}</p>}
   <label className="flex flex-col gap-1 text-[11px] text-ink-2">{t('versions.body.label')}<textarea data-testid="versions-body" rows={2} value={s.body} onChange={e=>c.setBody(e.target.value)} className="rounded-sm border border-subtle bg-transparent p-2 text-xs text-ink"/></label>
   <Button variant="primary" size="normal" data-testid="versions-save" disabled={!c.canSave()} onClick={()=>{void c.commit().then(v=>{if(v)onSaved?.();});}}>{saving?t('versions.saving'):withGit(t('versions.save'),'commit',advanced)}</Button>
  </div>
  {s.reviewAgain&&<div role="alert" data-testid="versions-review-again" className="rounded-sm border border-subtle p-2 text-[11px] text-ink">{t('versions.reviewAgain')}</div>}
  {s.saved&&<div role="status" data-testid="versions-saved" className="rounded-sm border border-subtle p-2 text-[11px] text-ink">{t('versions.saved',{subject:s.saved.subject})}{advanced&&<span className="ml-1 font-mono">{s.saved.sha.slice(0,7)}</span>}</div>}
  {errMsg}
 </div>;}
