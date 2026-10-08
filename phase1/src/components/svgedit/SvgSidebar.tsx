import {useState} from 'react';
import type {LucideIcon} from '../../lib/icons';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {useSvgUi,patchUi,type Tool} from '../../lib/svgedit/store';
import * as C from '../../lib/svgedit/controller';
import {parsePathKey,pathKey,type XEl} from '../../lib/svgedit/source';
import {MousePointer2,MousePointer,Square,Circle,Minus,PencilLine,Type,Eye,EyeOff,Lock,Unlock,ChevronDown,ChevronRight,Copy,Trash2,Container,SquareDashed} from '../../lib/icons';
import {useAppStore} from '../../store/appStore';
const TOOLS:{id:Tool;icon:LucideIcon;key:string;label:string}[]=[
 {id:'select',icon:MousePointer2,key:'V',label:'svg.toolSelect'},{id:'node',icon:MousePointer,key:'A',label:'svg.toolNode'},{id:'pen',icon:PencilLine,key:'P',label:'svg.toolPen'},
 {id:'rect',icon:Square,key:'R',label:'svg.toolRect'},{id:'ellipse',icon:Circle,key:'O',label:'svg.toolEllipse'},{id:'line',icon:Minus,key:'L',label:'svg.toolLine'},{id:'text',icon:Type,key:'T',label:'svg.toolText'}];
const SKIP=new Set(['defs','style','title','desc','metadata','script']);
export function SvgSidebar(){
 const {t}=useT();const ui=useSvgUi();useAppStore();const {root}=C.scan();const [renaming,setRenaming]=useState<string|null>(null);
 const row=(el:XEl,idx:number,depth:number)=>{const key=pathKey(el.path);const hidden=C.readPaint(el,'display')==='none';const locked=ui.locked.includes(key);const isG=el.children.length>0;const closed=ui.collapsed.includes(key);const picked=ui.selection.includes(key);
  const name=C.label(el,idx);
  return <div key={key}><div role="treeitem" aria-selected={picked} aria-label={name} data-testid="svg-layer" className={`svg-layer${picked?' is-picked':''}${hidden?' is-hidden':''}`} style={{paddingLeft:6+depth*14}}
   onClick={e=>{if(locked)return;patchUi({selection:e.shiftKey?(picked?ui.selection.filter(k=>k!==key):[...ui.selection,key]):[key]});}} onDoubleClick={()=>setRenaming(key)}>
   <button className="svg-layer-btn" aria-label={closed?t('svg.expand'):t('svg.collapse')} style={{visibility:isG?'visible':'hidden'}} onClick={e=>{e.stopPropagation();patchUi({collapsed:closed?ui.collapsed.filter(k=>k!==key):[...ui.collapsed,key]});}}>{closed?<ChevronRight size={12}/>:<ChevronDown size={12}/>}</button>
   {renaming===key?<input autoFocus className="svg-layer-rename" defaultValue={el.attrs.find(a=>a.name==='id')?.value??''} aria-label={t('svg.rename')} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Enter'){C.renameElement(key,e.currentTarget.value);setRenaming(null);}if(e.key==='Escape')setRenaming(null);}} onBlur={()=>setRenaming(null)}/>:<span className="grow truncate">{name}</span>}
   <button className="svg-layer-btn" aria-label={hidden?t('svg.show'):t('svg.hide')} onClick={e=>{e.stopPropagation();C.toggleHidden(key);}}>{hidden?<EyeOff size={13}/>:<Eye size={13}/>}</button>
   <button className="svg-layer-btn" aria-label={locked?t('svg.unlock'):t('svg.lock')} onClick={e=>{e.stopPropagation();C.toggleLock(key);}}>{locked?<Lock size={13}/>:<Unlock size={13}/>}</button></div>
   {isG&&!closed&&[...el.children].map((c,i)=>({c,i})).filter(({c})=>!SKIP.has(c.tag)).reverse().map(({c,i})=>row(c,i,depth+1))}</div>;};
 const kids=root?[...root.children].map((c,i)=>({c,i})).filter(({c})=>!SKIP.has(c.tag)).reverse():[];
 return <aside className="panel sidebar svg-sidebar" aria-label={t('svg.sidebar')} data-testid="svg-sidebar">
  <div className="svg-tools" role="toolbar" aria-label={t('svg.tools')}>{TOOLS.map(x=><Button key={x.id} size="icon" aria-label={`${t(x.label)} (${x.key})`} title={`${t(x.label)} (${x.key})`} aria-pressed={ui.tool===x.id} data-tool={x.id} className={`!size-8 ${ui.tool===x.id?'!bg-[var(--accent-soft)] !text-[var(--accent)]':''}`} onClick={()=>patchUi({tool:x.id})}><x.icon size={16}/></Button>)}</div>
  <div className="svg-layers-head"><span className="grow text-[11px] font-medium uppercase tracking-[.08em] text-ink-2">{t('svg.layers')}</span>
   <Button size="icon" className="!size-6" aria-label={t('svg.group')} disabled={!ui.selection.length} onClick={()=>C.group(ui.selection)}><Container size={13}/></Button>
   <Button size="icon" className="!size-6" aria-label={t('svg.ungroup')} disabled={ui.selection.length!==1} onClick={()=>C.ungroup(ui.selection[0])}><SquareDashed size={13}/></Button>
   <Button size="icon" className="!size-6" aria-label={t('svg.duplicate')} disabled={!ui.selection.length} onClick={()=>C.duplicate(ui.selection)}><Copy size={13}/></Button>
   <Button size="icon" className="!size-6" aria-label={t('svg.delete')} disabled={!ui.selection.length} onClick={()=>C.remove(ui.selection)}><Trash2 size={13}/></Button></div>
  <div className="svg-layer-tree" role="tree" aria-label={t('svg.layers')} data-testid="svg-layers">{kids.length?kids.map(({c,i})=>row(c,i,0)):<p className="p-4 text-[12px] text-ink-3">{t('svg.noLayers')}</p>}</div>
 </aside>;}
void parsePathKey;
