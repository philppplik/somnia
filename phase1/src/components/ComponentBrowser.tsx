import {useT} from '../lib/useT';
import {useMemo,useState} from 'react';
import {useAppStore,patchState} from '../store/appStore';
import {Button} from './ui/button';
import {loadLibrary,insertVariant} from '../lib/componentActions';
import * as cat from '../lib/componentCatalog';
import {loadMeta,saveMeta} from '../lib/componentCatalogStore';
import {variantOf} from '../lib/componentSystem';
/** Search, tags, folders and thumbnails for the component library. Dragging a card onto the canvas inserts it. */
export function ComponentBrowser(){
 const {t}=useT();
 const s=useAppStore();
 const lib=useMemo(loadLibrary,[s.notice]),[meta,setMeta]=useState(loadMeta),[q,setQ]=useState<cat.Query>(cat.emptyQuery),[editing,setEditing]=useState<string|null>(null),[tagText,setTagText]=useState(''),[folderText,setFolderText]=useState('');
 // Library edits in the panel below always set a notice, so reloading on notice keeps the grid current.
 const css=useMemo(()=>cat.extractStyles(s.files[s.designFile]??''),[s.files,s.designFile]);
 const shown=useMemo(()=>cat.search(lib,meta,q),[lib,meta,q]);
 const tags=cat.tagCounts(lib,meta),folders=cat.folderCounts(lib,meta);
 const change=(fn:(m:cat.MetaMap)=>cat.MetaMap)=>{try{const next=fn(meta);saveMeta(next);setMeta(next);}catch(error){patchState({notice:t('panels.browse.failed',{error:error instanceof Error?error.message:String(error)})});}};
 if(!lib.length)return null;
 return <section className="element-library" aria-label={t('panels.browse.browseComponents')}><h3>{t('panels.browse.browseComponents')}</h3>
  <input type="search" aria-label={t('panels.browse.searchComponents')} placeholder={t('panels.browse.searchNameVariantTagOr')} value={q.text} onChange={e=>setQ({...q,text:e.target.value})}/>
  {folders.length>1||folders[0]?.folder!==cat.UNFILED?<div role="group" aria-label={t('panels.browse.filterByFolder')}>
   <Button variant={q.folder===null?'primary':'outline'} onClick={()=>setQ({...q,folder:null})}>{t('panels.browse.allFolders')}</Button>
   {folders.map(f=><Button key={f.folder||'__none'} variant={q.folder===f.folder?'primary':'outline'} onClick={()=>setQ({...q,folder:q.folder===f.folder?null:f.folder})}>{f.folder||t('panels.browse.unfiled')} ({f.count})</Button>)}
  </div>:null}
  {tags.length?<div role="group" aria-label={t('panels.browse.filterByTag')}>{tags.map(t=><Button key={t.tag} variant={q.tag===t.tag?'primary':'outline'} onClick={()=>setQ({...q,tag:q.tag===t.tag?null:t.tag})}>#{t.tag} ({t.count})</Button>)}</div>:null}
  <p aria-live="polite" data-testid="browse-count">{t('panels.browse.count',{shown:shown.length,total:lib.length})}</p>
  {shown.map(c=>{const v=variantOf(c),m=cat.metaOf(meta,c.id);return <div key={c.id} role="group" aria-label={t('panels.browse.card',{name:c.name})} draggable onDragStart={e=>{e.dataTransfer.setData(cat.MIME_COMPONENT,cat.dragPayload(c.id,v.id));e.dataTransfer.effectAllowed='copy';}}>
   <iframe title={t('panels.browse.preview',{name:c.name})} sandbox="" loading="lazy" tabIndex={-1} srcDoc={cat.previewDoc(v.html,css)} style={{width:'100%',height:96,border:'1px solid var(--border,#e5e7eb)',borderRadius:8,pointerEvents:'none'}}/>
   <h4>{c.name}</h4><small>{m.folder?`${m.folder} · `:''}{m.tags.map(t=>`#${t}`).join(' ')}</small>
   <Button variant="outline" disabled={!s.coreConnected||!s.selectedElementId} aria-label={t('panels.browse.insert',{name:c.name})} onClick={()=>{try{insertVariant(c,v,true);}catch(error){patchState({notice:String(error)});}}}>{t('panels.browse.insertLabel')}</Button>
   <Button variant="outline" aria-label={t('panels.browse.organize',{name:c.name})} aria-expanded={editing===c.id} onClick={()=>{setEditing(editing===c.id?null:c.id);setTagText('');setFolderText(m.folder);}}>{t('panels.browse.organizeLabel')}</Button>
   {editing===c.id&&<div role="group" aria-label={t('panels.browse.options',{name:c.name})}>
    <label>{t('panels.browse.folderLabel')}<input aria-label={t('panels.browse.folder',{name:c.name})} list="somnia-folders" value={folderText} maxLength={cat.META_LIMITS.folder} onChange={e=>setFolderText(e.target.value)} onBlur={()=>folderText!==m.folder&&change(x=>cat.setFolder(x,c.id,folderText))}/></label>
    <datalist id="somnia-folders">{folders.filter(f=>f.folder).map(f=><option key={f.folder} value={f.folder}/>)}</datalist>
    <label>{t('panels.browse.addTag')}<input aria-label={t('panels.browse.tag',{name:c.name})} value={tagText} maxLength={cat.META_LIMITS.tag} onChange={e=>setTagText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&tagText.trim()){change(x=>cat.addTag(x,c.id,tagText));setTagText('');}}}/></label>
    {m.tags.map(tag=><Button key={tag} variant="outline" aria-label={t('panels.browse.removeTag',{tag:tag,name:c.name})} onClick={()=>change(x=>cat.removeTag(x,c.id,tag))}>#{tag} ×</Button>)}
   </div>}
  </div>;})}
 </section>;
}
