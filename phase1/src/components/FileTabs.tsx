import {pdfIsDirty,usePdfEpoch} from '../lib/pdfedit/session';
import {useEffect,useRef,useState} from 'react';
import {X,Columns2} from '../lib/icons';
import {closeFileTab,openFileTab,patchState,useAppStore} from '../store/appStore';
import {cn} from '../lib/cn';
import {closeMedia,setActiveMedia,useMedia} from '../lib/media';
import {rasterDirty} from '../store/rasterState';
import {useT} from '../lib/useT';
/** Browser-style tabs for open source files. Middle click or the x closes, right click opens a small tab menu. */
export function FileTabs(){usePdfEpoch();const {t}=useT();
 const s=useAppStore(),media=useMedia(),[menu,setMenu]=useState<{file:string;x:number;y:number}|null>(null),ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!menu)return;const down=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setMenu(null);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(null);};window.addEventListener('pointerdown',down);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',down);window.removeEventListener('keydown',key);};},[menu]);
 const others=(file:string)=>s.openFiles.filter(f=>f!==file);
 return <div role="tablist" aria-label={t('rest.fileTabs.openFiles')} className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-b border-subtle px-2 pt-1.5">
  {s.openFiles.map(file=><div key={file} role="tab" aria-selected={file===s.activeFile&&!media.active} tabIndex={file===s.activeFile&&!media.active?0:-1} title={file}
   className={cn('group flex h-8 max-w-[180px] cursor-pointer items-center gap-1 rounded-t-sm border border-b-0 border-transparent px-3 text-xs text-ink-2 hover:bg-hover',file===s.activeFile&&!media.active&&'border-subtle bg-base text-ink')}
   onClick={()=>openFileTab(file)} onAuxClick={e=>{if(e.button===1)closeFileTab(file);}}
   onContextMenu={e=>{e.preventDefault();setMenu({file,x:e.clientX,y:e.clientY});}}
   onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openFileTab(file);}}}>
   <span className="truncate">{file}</span>
   {s.openFiles.length>1&&<button aria-label={`Close ${file}`} className="grid size-4 place-items-center rounded-sm border-0 bg-transparent p-0 text-ink-3 opacity-0 hover:bg-hover hover:text-ink group-hover:opacity-100 focus-visible:opacity-100" onClick={e=>{e.stopPropagation();closeFileTab(file);}}><X size={12}/></button>}
  </div>)}
  {media.items.map(m=><div key={'media:'+m.name} role="tab" data-testid="media-tab" aria-selected={m.name===media.active} tabIndex={m.name===media.active?0:-1} title={m.name} className={cn('group flex h-8 max-w-[180px] cursor-pointer items-center gap-1 rounded-t-sm border border-b-0 border-transparent px-3 text-xs text-ink-2 hover:bg-hover',m.name===media.active&&'border-subtle bg-base text-ink')} onClick={()=>setActiveMedia(m.name)} onAuxClick={e=>{if(e.button===1)closeMedia(m.name);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setActiveMedia(m.name);}}}><span className="truncate">{m.name}{s.rasterDoc[m.name]&&rasterDirty(s.rasterDoc[m.name])&&<span aria-label="Unsaved image changes"> *</span>}{pdfIsDirty(m.name)?' *':''}</span><button aria-label={`Close ${m.name}`} className="grid size-4 place-items-center rounded-sm border-0 bg-transparent p-0 text-ink-3 opacity-0 hover:bg-hover hover:text-ink group-hover:opacity-100 focus-visible:opacity-100" onClick={e=>{e.stopPropagation();closeMedia(m.name);}}><X size={12}/></button></div>)}
  <button aria-label={t('rest.fileTabs.toggleDiffSplit')} aria-pressed={s.diffSplit} title={t('rest.fileTabs.compareInEditorDiffSplit')} onClick={()=>patchState({diffSplit:!s.diffSplit})} className={cn("ml-auto mb-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-sm border-0 bg-transparent text-ink-2 hover:bg-hover",s.diffSplit&&"bg-accent-soft text-accent")}><Columns2 size={14}/></button>
  {menu&&<div ref={ref} role="menu" aria-label={t('rest.fileTabs.tabActions')} className="menu-popup" style={{position:'fixed',left:menu.x,top:menu.y,zIndex:60}}>
   <button role="menuitem" className="menu-item" style={{width:'100%',background:'none',border:0,textAlign:'left'}} disabled={s.openFiles.length<=1} onClick={()=>{closeFileTab(menu.file);setMenu(null);}}>{t('rest.fileTabs.closeTab')}</button>
   <button role="menuitem" className="menu-item" style={{width:'100%',background:'none',border:0,textAlign:'left'}} disabled={others(menu.file).length===0} onClick={()=>{openFileTab(menu.file);others(menu.file).forEach(closeFileTab);setMenu(null);}}>{t('rest.fileTabs.closeOtherTabs')}</button>
   <button role="menuitem" className="menu-item" style={{width:'100%',background:'none',border:0,textAlign:'left'}} onClick={()=>{void navigator.clipboard?.writeText(menu.file).catch(()=>undefined);setMenu(null);}}>{t('rest.fileTabs.copyPath')}</button>
  </div>}
 </div>;
}
