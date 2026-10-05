import {useMemo,useState} from 'react';
import {useAppStore,patchState} from '../store/appStore';
import {Button} from './ui/button';
import {loadLibrary,insertVariant} from '../lib/componentActions';
import * as cat from '../lib/componentCatalog';
import {loadMeta,saveMeta} from '../lib/componentCatalogStore';
import {variantOf} from '../lib/componentSystem';
/** Search, tags, folders and thumbnails for the component library. Dragging a card onto the canvas inserts it. */
export function ComponentBrowser(){
 const s=useAppStore();
 const lib=useMemo(loadLibrary,[s.notice]),[meta,setMeta]=useState(loadMeta),[q,setQ]=useState<cat.Query>(cat.emptyQuery),[editing,setEditing]=useState<string|null>(null),[tagText,setTagText]=useState(''),[folderText,setFolderText]=useState('');
 // Library edits in the panel below always set a notice, so reloading on notice keeps the grid current.
 const css=useMemo(()=>cat.extractStyles(s.files[s.designFile]??''),[s.files,s.designFile]);
 const shown=useMemo(()=>cat.search(lib,meta,q),[lib,meta,q]);
 const tags=cat.tagCounts(lib,meta),folders=cat.folderCounts(lib,meta);
 const change=(fn:(m:cat.MetaMap)=>cat.MetaMap)=>{try{const next=fn(meta);saveMeta(next);setMeta(next);}catch(error){patchState({notice:`Could not update the component: ${error instanceof Error?error.message:String(error)} Nothing was changed.`});}};
 if(!lib.length)return null;
 return <section className="element-library" aria-label="Browse components"><h3>Browse components</h3>
  <input type="search" aria-label="Search components" placeholder="Search name, variant, tag or folder" value={q.text} onChange={e=>setQ({...q,text:e.target.value})}/>
  {folders.length>1||folders[0]?.folder!==cat.UNFILED?<div role="group" aria-label="Filter by folder">
   <Button variant={q.folder===null?'primary':'outline'} onClick={()=>setQ({...q,folder:null})}>All folders</Button>
   {folders.map(f=><Button key={f.folder||'__none'} variant={q.folder===f.folder?'primary':'outline'} onClick={()=>setQ({...q,folder:q.folder===f.folder?null:f.folder})}>{f.folder||'Unfiled'} ({f.count})</Button>)}
  </div>:null}
  {tags.length?<div role="group" aria-label="Filter by tag">{tags.map(t=><Button key={t.tag} variant={q.tag===t.tag?'primary':'outline'} onClick={()=>setQ({...q,tag:q.tag===t.tag?null:t.tag})}>#{t.tag} ({t.count})</Button>)}</div>:null}
  <p aria-live="polite" data-testid="browse-count">{shown.length} of {lib.length} components. Drag a card onto a container in the canvas, or select a container and press Insert.</p>
  {shown.map(c=>{const v=variantOf(c),m=cat.metaOf(meta,c.id);return <div key={c.id} role="group" aria-label={`Card ${c.name}`} draggable onDragStart={e=>{e.dataTransfer.setData(cat.MIME_COMPONENT,cat.dragPayload(c.id,v.id));e.dataTransfer.effectAllowed='copy';}}>
   <iframe title={`Preview of ${c.name}`} sandbox="" loading="lazy" tabIndex={-1} srcDoc={cat.previewDoc(v.html,css)} style={{width:'100%',height:96,border:'1px solid var(--border,#e5e7eb)',borderRadius:8,pointerEvents:'none'}}/>
   <h4>{c.name}</h4><small>{m.folder?`${m.folder} · `:''}{m.tags.map(t=>`#${t}`).join(' ')}</small>
   <Button variant="outline" disabled={!s.coreConnected||!s.selectedElementId} aria-label={`Quick insert ${c.name}`} onClick={()=>{try{insertVariant(c,v,true);}catch(error){patchState({notice:String(error)});}}}>Insert</Button>
   <Button variant="outline" aria-label={`Organize ${c.name}`} aria-expanded={editing===c.id} onClick={()=>{setEditing(editing===c.id?null:c.id);setTagText('');setFolderText(m.folder);}}>Organize</Button>
   {editing===c.id&&<div role="group" aria-label={`Organize ${c.name} options`}>
    <label>Folder<input aria-label={`Folder for ${c.name}`} list="somnia-folders" value={folderText} maxLength={cat.META_LIMITS.folder} onChange={e=>setFolderText(e.target.value)} onBlur={()=>folderText!==m.folder&&change(x=>cat.setFolder(x,c.id,folderText))}/></label>
    <datalist id="somnia-folders">{folders.filter(f=>f.folder).map(f=><option key={f.folder} value={f.folder}/>)}</datalist>
    <label>Add tag<input aria-label={`New tag for ${c.name}`} value={tagText} maxLength={cat.META_LIMITS.tag} onChange={e=>setTagText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&tagText.trim()){change(x=>cat.addTag(x,c.id,tagText));setTagText('');}}}/></label>
    {m.tags.map(t=><Button key={t} variant="outline" aria-label={`Remove tag ${t} from ${c.name}`} onClick={()=>change(x=>cat.removeTag(x,c.id,t))}>#{t} ×</Button>)}
   </div>}
  </div>;})}
 </section>;
}
