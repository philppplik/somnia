import {NativeButton} from './ui/native-controls';
import {slidesIsDirty,useSlidesSession} from '../lib/slides/session';
import {pdfIsDirty,usePdfEpoch} from '../lib/pdfedit/session';
import {useEffect,useRef,useState} from 'react';
import {useMenuFocusReturn} from '../lib/useMenuFocusReturn';
import {nextTabIndex} from '../lib/tabNav';
import {X} from '../lib/icons';
import {closeFileTab,openFileTab,useAppStore} from '../store/appStore';
import {cn} from '../lib/cn';
import {closeMedia,setActiveMedia,useMedia} from '../lib/media';
import {rasterDirty} from '../store/rasterState';
import {useT} from '../lib/useT';
import {mediaTabStudio,scopedFiles} from '../lib/tabScope';
import {studioForMedia} from '../lib/studios/studioRouting';
/** Browser-style tabs for open source files. Middle click or the x closes, right click opens a small tab menu. */
export function FileTabs(){useSlidesSession();usePdfEpoch();const {t}=useT();
 const s=useAppStore(),media=useMedia(),[menu,setMenu]=useState<{file:string;x:number;y:number}|null>(null),ref=useRef<HTMLDivElement>(null);
 useMenuFocusReturn(menu!==null,ref);
 useEffect(()=>{if(!menu)return;ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();const down=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setMenu(null);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(null);};window.addEventListener('pointerdown',down);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',down);window.removeEventListener('keydown',key);};},[menu]);
 const files=scopedFiles(s.openFiles,s.activeStudio,s.studioByTab),mediaItems=media.items.filter(m=>mediaTabStudio(m.name,s.studioByTab,()=>studioForMedia(m.kind,s.activeStudio))===s.activeStudio);
 const others=(file:string)=>files.filter(f=>f!==file);
 return <div role="tablist" aria-label={t('rest.fileTabs.openFiles')} className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-b border-subtle px-2 pt-1.5"
  onKeyDown={e=>{const tabs=[...e.currentTarget.querySelectorAll<HTMLElement>('[role=tab]')];const n=nextTabIndex(e.key,tabs.indexOf(document.activeElement as HTMLElement),tabs.length);if(n===null)return;e.preventDefault();tabs[n]?.focus();tabs[n]?.click();}}>
  {files.map(file=><div key={file} role="tab" aria-selected={file===s.activeFile&&!media.active} tabIndex={file===s.activeFile&&!media.active?0:-1} title={file}
   className={cn('group flex h-8 max-w-[180px] cursor-pointer items-center gap-1 rounded-t-sm border border-b-0 border-transparent px-3 text-xs text-ink-2 hover:bg-hover',file===s.activeFile&&!media.active&&'border-subtle bg-base text-ink')}
   onClick={()=>openFileTab(file)} onAuxClick={e=>{if(e.button===1)closeFileTab(file);}}
   onContextMenu={e=>{e.preventDefault();setMenu({file,x:e.clientX,y:e.clientY});}}
   onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openFileTab(file);}if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();setMenu({file,x:r.left,y:r.bottom});}}}>
   <span className="truncate">{file}</span>
   <NativeButton aria-label={`Close ${file}`} className="grid size-4 place-items-center rounded-sm border-0 bg-transparent p-0 text-ink-3 opacity-60 hover:bg-hover hover:text-ink group-hover:opacity-100 focus-visible:opacity-100" onClick={e=>{e.stopPropagation();closeFileTab(file);}}><X size={12}/></NativeButton>
  </div>)}
  {mediaItems.map(m=><div key={'media:'+m.name} role="tab" data-testid="media-tab" aria-selected={m.name===media.active} tabIndex={m.name===media.active?0:-1} title={m.name} className={cn('group flex h-8 max-w-[180px] cursor-pointer items-center gap-1 rounded-t-sm border border-b-0 border-transparent px-3 text-xs text-ink-2 hover:bg-hover',m.name===media.active&&'border-subtle bg-base text-ink')} onClick={()=>setActiveMedia(m.name)} onAuxClick={e=>{if(e.button===1)closeMedia(m.name);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setActiveMedia(m.name);}}}><span className="truncate">{m.name}{s.rasterDoc[m.name]&&rasterDirty(s.rasterDoc[m.name])&&<span aria-label="Unsaved image changes"> *</span>}{pdfIsDirty(m.name)||slidesIsDirty(m.name)?' *':''}</span><NativeButton aria-label={`Close ${m.name}`} className="grid size-4 place-items-center rounded-sm border-0 bg-transparent p-0 text-ink-3 opacity-0 hover:bg-hover hover:text-ink group-hover:opacity-100 focus-visible:opacity-100" onClick={e=>{e.stopPropagation();closeMedia(m.name);}}><X size={12}/></NativeButton></div>)}
  {menu&&<div ref={ref} role="menu" aria-label={t('rest.fileTabs.tabActions')} className="menu-popup" style={{position:'fixed',left:menu.x,top:menu.y,zIndex:60}} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const b=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const i=b.indexOf(document.activeElement as HTMLButtonElement);b[(i+(e.key==='ArrowDown'?1:-1)+b.length)%b.length]?.focus();}}}>
   <NativeButton role="menuitem" className="menu-item" style={{width:'100%',background:'none',border:0,textAlign:'left'}} onClick={()=>{closeFileTab(menu.file);setMenu(null);}}>{t('rest.fileTabs.closeTab')}</NativeButton>
   <NativeButton role="menuitem" className="menu-item" style={{width:'100%',background:'none',border:0,textAlign:'left'}} disabled={others(menu.file).length===0} onClick={()=>{openFileTab(menu.file);others(menu.file).forEach(closeFileTab);setMenu(null);}}>{t('rest.fileTabs.closeOtherTabs')}</NativeButton>
   <NativeButton role="menuitem" className="menu-item" style={{width:'100%',background:'none',border:0,textAlign:'left'}} onClick={()=>{void navigator.clipboard?.writeText(menu.file).catch(()=>undefined);setMenu(null);}}>{t('rest.fileTabs.copyPath')}</NativeButton>
  </div>}
 </div>;
}
