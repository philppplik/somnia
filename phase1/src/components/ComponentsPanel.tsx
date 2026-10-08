import {useEffect,useMemo,useRef,useState} from 'react';
import {useT} from '../lib/useT';
import {useAppStore,patchState} from '../store/appStore';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Boxes,Plus,Search,X,Check} from '../lib/icons';
import {cn} from '../lib/cn';
import * as cs from '../lib/componentSystem';
import * as cat from '../lib/componentCatalog';
import {loadLibrary,mutate,newId,selectedSource,insertVariant,switchVariant} from '../lib/componentActions';
import {loadMeta,saveMeta} from '../lib/componentCatalogStore';
import {builtinBlocks,CATEGORIES,type Category} from '../lib/builtinBlocks';
import {elements,insertElement} from '../lib/structureCommands';
import {setComponentDrag} from '../lib/componentDrag';
import {ComponentSystemPanel} from './ComponentSystemPanel';

/** Scope and chip survive tab switches but not a reload (module state, never persisted). */
const session:{scope:'blocks'|'mine';category:Category|null}={scope:'blocks',category:null};
type Scope=typeof session.scope;
/** "Name copy", "Name copy 2", ... within the 60-character name limit; library names are unique (case-insensitive). */
export function uniqueName(list:cs.Component[],base:string):string{const taken=new Set(list.map(c=>c.name.trim().toLowerCase()));for(let n=1;;n++){const suffix=n===1?' copy':` copy ${n}`;const name=base.slice(0,cs.LIMITS.name-suffix.length)+suffix;if(!taken.has(name.toLowerCase()))return name;}}

const PREVIEW_W=960,PREVIEW_H=640;
function useLazyMount(){const ref=useRef<HTMLDivElement>(null);const [seen,setSeen]=useState(typeof IntersectionObserver==='undefined');const [scale,setScale]=useState(0.11);
 useEffect(()=>{const el=ref.current;if(!el||typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(()=>{if(el.clientWidth)setScale(el.clientWidth/PREVIEW_W);});ro.observe(el);if(el.clientWidth)setScale(el.clientWidth/PREVIEW_W);return()=>ro.disconnect();},[]);
 useEffect(()=>{const el=ref.current;if(seen||!el)return;const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){setSeen(true);io.disconnect();}},{rootMargin:'120px'});io.observe(el);return()=>io.disconnect();},[seen]);
 return {ref,seen,scale};}

interface CardProps{c:cs.Component;mine:boolean;css:string;meta:cat.Meta;canWrite:boolean;hasSelection:boolean;selected:boolean;onSelect:()=>void;onMenu:(x:number,y:number)=>void;onError:(e:unknown)=>void}
function Card({c,mine,css,meta,canWrite,hasSelection,selected,onSelect,onMenu,onError}:CardProps){
 const {t}=useT();const {ref,seen,scale}=useLazyMount();const [vid,setVid]=useState(c.defaultVariantId);
 const v=c.variants.find(x=>x.id===vid)??cs.variantOf(c);
 const insert=()=>{try{insertVariant(c,v,true);}catch(error){onError(error);}};
 const replace=()=>{try{switchVariant(c,v,true);}catch(error){onError(error);}};
 const ghost=(e:React.DragEvent)=>{e.dataTransfer.setData(cat.MIME_COMPONENT,cat.dragPayload(c.id,v.id));e.dataTransfer.effectAllowed='copy';setComponentDrag({name:c.name,variant:v.name});
  const g=document.createElement('div');g.textContent=`${c.name} · ${v.name}`;g.style.cssText='position:fixed;top:-100px;left:-100px;padding:6px 10px;border-radius:11px;background:#fff;border:1px solid #6d28d9;color:#1a1a2e;font:600 11px system-ui;box-shadow:0 4px 12px #0003';document.body.append(g);e.dataTransfer.setDragImage(g,10,10);setTimeout(()=>g.remove(),0);};
 return <div role="group" aria-label={t('panels.browse.card',{name:c.name})} data-testid="component-card" data-card-id={c.id} className={cn('group relative min-w-0 rounded-lg border border-subtle bg-elevated',selected&&'ring-2 ring-accent')} onContextMenu={e=>{e.preventDefault();onSelect();onMenu(e.clientX,e.clientY);}}>
  <button type="button" draggable aria-pressed={selected} aria-label={t('panels.components.cardButton',{name:c.name})} className="block w-full cursor-grab rounded-lg border-0 bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" onClick={onSelect} onDoubleClick={insert} onDragStart={ghost} onDragEnd={()=>setComponentDrag(null)}
   onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();insert();}else if((e.shiftKey&&e.key==='F10')||e.key==='ContextMenu'){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();onMenu(r.left+8,r.bottom-8);}
    else if(e.key.startsWith('Arrow')){const grid=e.currentTarget.closest('[data-card-grid]');const all=[...(grid?.querySelectorAll<HTMLButtonElement>('[data-card-main]')??[])];const i=all.indexOf(e.currentTarget);const n=e.key==='ArrowRight'?i+1:e.key==='ArrowLeft'?i-1:e.key==='ArrowDown'?i+2:i-2;if(all[n]){e.preventDefault();all[n].focus();}}}} data-card-main="">
   <div ref={ref} className="relative h-24 overflow-hidden rounded-t-lg bg-white">{seen&&<iframe title={t('panels.browse.preview',{name:c.name})} sandbox="" tabIndex={-1} data-testid="card-preview" srcDoc={cat.previewDoc(v.html,css)} className="pointer-events-none absolute left-0 top-0 border-0" style={{width:PREVIEW_W,height:PREVIEW_H,transform:`scale(${scale})`,transformOrigin:'top left'}}/>}</div>
   <div className="flex items-center gap-1.5 px-2 py-1.5"><span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">{c.name}</span>
    <span className="shrink-0 rounded-sm bg-accent-soft px-1 text-[9px] text-accent">{mine?t('panels.components.mine'):t('panels.components.varBadge',{count:c.variants.length})}</span><span aria-hidden="true" className="shrink-0 text-[10px] text-ink-3 opacity-0 group-hover:opacity-100">⠿</span></div>
   {mine&&(meta.folder||meta.tags.length>0)&&<small className="block truncate px-2 pb-1.5 text-[10px] text-ink-3">{meta.folder?`${meta.folder} · `:''}{meta.tags.map(x=>`#${x}`).join(' ')}</small>}
  </button>
  <div className={cn('absolute inset-0 flex flex-col justify-center gap-1 overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--bg-panel)_92%,transparent)] p-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',selected&&'opacity-100')}>
   {c.variants.length>1&&<div role="group" aria-label={t('panels.components.variantsOf',{name:c.name})} className="flex flex-col gap-0.5">{c.variants.map(x=><Button key={x.id} size="tiny" variant={x.id===v.id?'primary':'outline'} className="h-5 w-full justify-start truncate" aria-pressed={x.id===v.id} onClick={()=>setVid(x.id)}>{x.name}</Button>)}</div>}
   <div className="flex flex-wrap items-center gap-1"><Button size="tiny" variant="primary" disabled={!canWrite} aria-label={t('panels.components.cardInsert',{name:c.name,variant:v.name})} onClick={insert}>{t('panels.components.insertLabel')}</Button>
    <Button size="tiny" variant="outline" disabled={!canWrite||!hasSelection} aria-label={t('panels.components.cardReplace',{name:c.name,variant:v.name})} onClick={replace}>{t('panels.components.replaceLabel')}</Button>
    <Button size="tiny" aria-label={t('panels.components.actionsFor',{name:c.name})} aria-haspopup="menu" onClick={e=>{const r=e.currentTarget.getBoundingClientRect();onSelect();onMenu(r.left,r.bottom);}}>⋯</Button></div>
   <span className="text-[9px] leading-tight text-ink-3">{t('panels.components.dragHint')}</span>
  </div>
 </div>;
}

type MenuState={x:number;y:number;c:cs.Component;mine:boolean}|null;
function CardMenu({menu,onClose,actions}:{menu:NonNullable<MenuState>;onClose:()=>void;actions:{label:string;run:()=>void;danger?:boolean}[]}){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{root.current?.querySelector<HTMLButtonElement>('button')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};const down=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))onClose();};window.addEventListener('keydown',key);window.addEventListener('pointerdown',down);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',down);};},[onClose]);
 return <div ref={root} role="menu" aria-label={menu.c.name} className="fixed z-50 flex min-w-44 flex-col rounded-lg border border-subtle bg-elevated p-1 shadow-lg" style={{left:Math.min(menu.x,window.innerWidth-190),top:Math.min(menu.y,window.innerHeight-170)}}
  onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const b=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];const i=b.indexOf(document.activeElement as HTMLButtonElement);b[(i+(e.key==='ArrowDown'?1:-1)+b.length)%b.length].focus();}}}>
  {actions.map(a=><button key={a.label} role="menuitem" type="button" className={cn('h-8 rounded-sm border-0 bg-transparent px-2 text-left text-xs text-ink-2 hover:bg-hover hover:text-ink focus-visible:bg-hover',a.danger&&'text-red-600')} onClick={()=>{onClose();a.run();}}>{a.label}</button>)}
 </div>;
}

function NameDialog({title,initial,confirm,onCancel,onSubmit}:{title:string;initial:string;confirm:string;onCancel:()=>void;onSubmit:(name:string)=>void}){
 const {t}=useT();const [name,setName]=useState(initial);
 return <Dialog open onOpenChange={o=>{if(!o)onCancel();}}><DialogContent className="w-[360px] max-w-[92vw] p-5"><DialogTitle className="m-0 text-sm font-semibold">{title}</DialogTitle><DialogDescription className="sr-only">{title}</DialogDescription>
  <form className="mt-3 flex flex-col gap-3" onSubmit={e=>{e.preventDefault();onSubmit(name);}}><label className="flex flex-col gap-1 text-xs">{t('panels.components.name')}<input autoFocus aria-label={t('panels.components.nameField')} value={name} maxLength={cs.LIMITS.name} onChange={e=>setName(e.target.value)}/></label>
   <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>{t('panels.components.cancel')}</Button><Button type="submit" variant="primary" disabled={!name.trim()}>{confirm}</Button></div></form></DialogContent></Dialog>;
}

function OrganizeDialog({c,meta,folders,onChange,onClose}:{c:cs.Component;meta:cat.Meta;folders:string[];onChange:(fn:(m:cat.MetaMap)=>cat.MetaMap)=>void;onClose:()=>void}){
 const {t}=useT();const [folder,setFolder]=useState(meta.folder),[tag,setTag]=useState('');
 return <Dialog open onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="w-[380px] max-w-[92vw] p-5"><DialogTitle className="m-0 text-sm font-semibold">{t('panels.components.organizeTitle',{name:c.name})}</DialogTitle><DialogDescription className="sr-only">{t('panels.components.organizeTitle',{name:c.name})}</DialogDescription>
  <div role="group" aria-label={t('panels.browse.options',{name:c.name})} className="mt-3 flex flex-col gap-3">
   <label className="flex flex-col gap-1 text-xs">{t('panels.browse.folderLabel')}<input aria-label={t('panels.browse.folder',{name:c.name})} list="somnia-folders" value={folder} maxLength={cat.META_LIMITS.folder} onChange={e=>setFolder(e.target.value)} onBlur={()=>folder!==meta.folder&&onChange(x=>cat.setFolder(x,c.id,folder))}/></label>
   <datalist id="somnia-folders">{folders.filter(Boolean).map(f=><option key={f} value={f}/>)}</datalist>
   <label className="flex flex-col gap-1 text-xs">{t('panels.browse.addTag')}<input aria-label={t('panels.browse.tag',{name:c.name})} value={tag} maxLength={cat.META_LIMITS.tag} onChange={e=>setTag(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&tag.trim()){e.preventDefault();onChange(x=>cat.addTag(x,c.id,tag));setTag('');}}}/></label>
   <div className="flex flex-wrap gap-1">{meta.tags.map(x=><Button key={x} size="compact" variant="outline" aria-label={t('panels.browse.removeTag',{tag:x,name:c.name})} onClick={()=>onChange(m=>cat.removeTag(m,c.id,x))}>#{x} ×</Button>)}</div>
   <div className="flex justify-end"><Button variant="primary" onClick={()=>{if(folder!==meta.folder)onChange(x=>cat.setFolder(x,c.id,folder));onClose();}}><Check/>{t('panels.components.done')}</Button></div>
  </div></DialogContent></Dialog>;
}

/** One panel for everything insertable: built-in blocks, the user's library and the basic HTML elements. Replaces the old stacked ElementsPanel. */
export function ComponentsPanel(){
 const {t}=useT();const s=useAppStore();
 const [scope,setScopeState]=useState<Scope>(session.scope),[category,setCategoryState]=useState<Category|null>(session.category),[text,setText]=useState('');
 const setScope=(v:Scope)=>{session.scope=v;setScopeState(v);};const setCategory=(v:Category|null)=>{session.category=v;setCategoryState(v);};
 const [lib,setLib]=useState(loadLibrary),[meta,setMeta]=useState(loadMeta),[selected,setSelected]=useState<string|null>(null),[menu,setMenu]=useState<MenuState>(null);
 const [dialog,setDialog]=useState<null|{kind:'save'}|{kind:'rename';c:cs.Component}|{kind:'organize';c:cs.Component}>(null);
 // Library edits elsewhere (advanced tools, share panel) always set a notice, so reloading on notice keeps the grid current.
 useEffect(()=>{setLib(loadLibrary());setMeta(loadMeta());},[s.notice]);
 const blocks=useMemo(builtinBlocks,[]);
 const css=useMemo(()=>cat.extractStyles(s.files[s.designFile]??''),[s.files,s.designFile]);
 const canWrite=s.coreConnected,hasSelection=!!s.selectedElementId,q=text.trim();
 const fail=(error:unknown)=>patchState({notice:error instanceof Error?error.message:String(error)});
 const run=(fn:()=>void)=>{try{fn();}catch(error){patchState({notice:t('panels.components.failed',{error:error instanceof Error?error.message:String(error)})});}};
 const change=(fn:(m:cat.MetaMap)=>cat.MetaMap)=>{try{const next=fn(meta);saveMeta(next);setMeta(next);}catch(error){patchState({notice:t('panels.browse.failed',{error:error instanceof Error?error.message:String(error)})});}};
 const blockHits=useMemo(()=>cat.search(blocks,{},{text:q,tag:null,folder:null,category:category}),[blocks,q,category]);
 const mineHits=useMemo(()=>cat.search(lib,meta,{text:q,tag:null,folder:null}),[lib,meta,q]);
 const basics=elements.map((_e,i)=>({i,label:t('panels.elements.item.'+i)})).filter(b=>!q||b.label.toLowerCase().includes(q.toLowerCase())||'basics'.includes(q.toLowerCase()));
 const folders=cat.folderCounts(lib,meta).map(f=>f.folder);
 const duplicate=(c:cs.Component)=>run(()=>{const copy:cs.Component={id:newId(),name:uniqueName(lib,c.name),variants:c.variants.map(v=>({id:newId(),name:v.name,html:cs.stripMarks(v.html)})),defaultVariantId:''};copy.defaultVariantId=copy.variants[Math.max(0,c.variants.findIndex(v=>v.id===c.defaultVariantId))].id;setLib(mutate(l=>{if(l.length>=cs.LIMITS.components)throw new Error(t('panels.components.libraryFull'));return [...l,copy];}));patchState({notice:t('panels.components.duplicated',{name:c.name})});setScope('mine');});
 const card=(c:cs.Component,mine:boolean)=><Card key={(mine?'m:':'b:')+c.id} c={c} mine={mine} css={css} meta={cat.metaOf(meta,c.id)} canWrite={canWrite} hasSelection={hasSelection} selected={selected===c.id} onSelect={()=>setSelected(c.id)} onMenu={(x,y)=>setMenu({x,y,c,mine})} onError={fail}/>;
 const grid=(list:cs.Component[],mine:boolean)=><div data-card-grid="" className="grid grid-cols-2 gap-2">{list.map(c=>card(c,mine))}</div>;
 const label=(txt:string)=><h4 className="m-0 px-1 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-ink-3">{txt}</h4>;
 const total=blockHits.length+mineHits.length+basics.length;
 const menuActions=(m:NonNullable<MenuState>)=>[
  {label:t('panels.components.insertLabel'),run:()=>run(()=>insertVariant(m.c,cs.variantOf(m.c),true))},
  ...(m.mine?[{label:t('panels.components.organizeMenu'),run:()=>setDialog({kind:'organize',c:m.c})}]:[]),
  {label:t('panels.components.duplicateMenu'),run:()=>duplicate(m.c)},
  ...(m.mine?[{label:t('panels.components.renameMenu'),run:()=>setDialog({kind:'rename',c:m.c})},{label:t('panels.components.removeMenu'),danger:true,run:()=>run(()=>{if(window.confirm(t('panels.components.confirmRemove',{name:m.c.name})))setLib(mutate(l=>cs.removeComponent(l,m.c.id)));})}]:[]),
 ];
 return <section className="flex flex-col gap-2 px-3 pb-4 pt-3" aria-label={t('panels.components.componentLibrary')} data-testid="components-panel">
  <header className="flex items-center gap-2"><h3 className="m-0 flex-1 text-sm font-semibold text-ink">{t('panels.components.components')}</h3>
   <Button size="compact" variant="primary" disabled={!canWrite||!hasSelection} title={hasSelection?undefined:t('panels.components.saveDisabled')} aria-label={t('panels.components.saveSelection')} onClick={()=>setDialog({kind:'save'})}><Plus/>{t('panels.components.saveSelection')}</Button>
  </header>
  <label className="flex items-center gap-2 rounded-[16px] border border-subtle bg-elevated px-3 text-ink-3 [&_input]:border-0! [&_input]:bg-transparent! [&_input]:px-0! [&_input]:py-2! [&_input]:text-xs"><Search size={14}/>
   <input type="search" aria-label={t('panels.browse.searchComponents')} placeholder={t('panels.components.searchPlaceholder')} value={text} onChange={e=>setText(e.target.value)} className="min-w-0 flex-1"/>
   {text&&<button type="button" aria-label={t('panels.components.clearSearch')} className="border-0 bg-transparent p-0 text-ink-3 hover:text-ink" onClick={()=>setText('')}><X size={14}/></button>}</label>
  <div role="tablist" aria-label={t('panels.components.scopeLabel')} className="grid grid-cols-2 gap-1 rounded-[16px] bg-[color-mix(in_srgb,var(--bg-surface)_90%,#000_4%)] p-1">
   {(['blocks','mine'] as const).map(k=><button key={k} role="tab" type="button" aria-selected={scope===k} data-testid={`scope-${k}`} className={cn('h-7 rounded-[12px] border-0 bg-transparent text-[11px] text-ink-2',scope===k&&'bg-elevated font-semibold text-ink shadow-sm')} onClick={()=>setScope(k)}>{k==='blocks'?t('panels.components.scopeBlocks'):t('panels.components.scopeMine')} · {k==='blocks'?blocks.reduce((n,c)=>n+c.variants.length,0):lib.length}</button>)}
  </div>
  {scope==='blocks'&&<div role="group" aria-label={t('panels.components.categoriesLabel')} className="flex gap-1 overflow-x-auto pb-1" data-testid="category-chips">
   {([null,...CATEGORIES] as (Category|null)[]).map(k=><Button key={k??'all'} size="compact" variant={category===k?'primary':'outline'} aria-pressed={category===k} className="shrink-0" onClick={()=>setCategory(k)}>{k?t('panels.components.cat.'+k):t('panels.components.catAll')}</Button>)}</div>}
  <p aria-live="polite" data-testid="browse-count" className={cn('m-0 text-[11px] text-ink-3',!q&&'sr-only')}>{q?t('panels.components.resultsFor',{count:total,query:q}):t('panels.browse.count',{shown:scope==='blocks'?blockHits.length:mineHits.length,total:scope==='blocks'?blocks.length:lib.length})}</p>
  {q?<>
   {total===0&&<div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-ink-2"><Boxes size={24} aria-hidden="true"/><p className="m-0">{t('panels.components.noResults',{query:q})}</p><Button size="compact" variant="outline" onClick={()=>setText('')}>{t('panels.components.clearSearch')}</Button></div>}
   {basics.length>0&&<><>{label(t('panels.components.basics'))}</><BasicsRows rows={basics} canWrite={canWrite} fail={fail}/></>}
   {blockHits.length>0&&<>{label(t('panels.components.scopeBlocks'))}{grid(blockHits,false)}</>}
   {mineHits.length>0&&<>{label(t('panels.components.resultsMine'))}{grid(mineHits,true)}</>}
  </>:scope==='blocks'?<>
   {category===null&&<><>{label(t('panels.components.basics'))}</><BasicsRows rows={basics} canWrite={canWrite} fail={fail}/></>}
   {(category?[category]:CATEGORIES).map(k=>{const list=blockHits.filter(c=>c.category===k);return list.length?<div key={k} data-testid={`group-${k}`}>{label(t('panels.components.cat.'+k))}{grid(list,false)}</div>:null;})}
  </>:<>
   {lib.length===0?<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line p-5 text-center text-xs text-ink-2"><Boxes size={24} aria-hidden="true"/><p className="m-0">{t('panels.components.emptyMine')}</p></div>:grid(mineHits,true)}
   <details className="mt-2" data-testid="components-advanced"><summary className="cursor-pointer text-[11px] text-ink-2">{t('panels.components.advanced')}</summary><ComponentSystemPanel key={`${lib.length}:${s.notice}`}/></details>
  </>}
  {menu&&<CardMenu menu={menu} onClose={()=>setMenu(null)} actions={menuActions(menu)}/>}
  {dialog?.kind==='save'&&<NameDialog title={t('panels.components.saveTitle')} initial="" confirm={t('panels.components.save')} onCancel={()=>setDialog(null)} onSubmit={name=>{setDialog(null);run(()=>{setLib(mutate(l=>cs.createComponent(l,name,selectedSource(),newId)));patchState({notice:t('panels.components.saved',{name:name.trim()})});setScope('mine');});}}/>}
  {dialog?.kind==='rename'&&<NameDialog title={t('panels.components.renameTitle')} initial={dialog.c.name} confirm={t('panels.components.save')} onCancel={()=>setDialog(null)} onSubmit={name=>{const id=dialog.c.id;setDialog(null);run(()=>{setLib(mutate(l=>cs.renameComponent(l,id,name)));patchState({notice:t('panels.components.renamed',{name:name.trim()})});});}}/>}
  {dialog?.kind==='organize'&&<OrganizeDialog c={dialog.c} meta={cat.metaOf(meta,dialog.c.id)} folders={folders} onChange={change} onClose={()=>setDialog(null)}/>}
 </section>;
}

function BasicsRows({rows,canWrite,fail}:{rows:{i:number;label:string}[];canWrite:boolean;fail:(e:unknown)=>void}){
 return <div className="flex flex-col gap-1" data-testid="basics-group">{rows.map(({i,label})=><Button key={i} variant="outline" size="compact" draggable disabled={!canWrite} className="h-8 w-full justify-start"
  onDragStart={e=>{e.dataTransfer.setData('application/x-somnia-element',String(i));e.dataTransfer.effectAllowed='copy';}}
  onClick={()=>{try{insertElement(i);}catch(error){fail(error);}}}>{label}</Button>)}</div>;
}
