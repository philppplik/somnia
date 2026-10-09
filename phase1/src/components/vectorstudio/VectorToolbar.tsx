import {Circle,Minus,MousePointer2,Plus,Redo2,Square,Undo2,ZoomIn} from '../../lib/icons';
import {NodeIcon,PenNibIcon,PolygonIcon,StarIcon} from './icons';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {redo,setTool,setView,undo,useVectorSession,type VectorTool} from '../../lib/vectorstudio/session';
const TOOLS:{id:VectorTool;icon:typeof Square;key:string;shortcut:string}[]=[
 {id:'select',icon:MousePointer2,key:'vector.tool.select',shortcut:'V'},{id:'node',icon:NodeIcon,key:'vector.tool.node',shortcut:'A'},{id:'pen',icon:PenNibIcon,key:'vector.tool.pen',shortcut:'P'},
 {id:'rect',icon:Square,key:'vector.tool.rect',shortcut:'R'},{id:'ellipse',icon:Circle,key:'vector.tool.ellipse',shortcut:'E'},{id:'line',icon:Minus,key:'vector.tool.line',shortcut:'L'},
 {id:'polygon',icon:PolygonIcon,key:'vector.tool.polygon',shortcut:'G'},{id:'star',icon:StarIcon,key:'vector.tool.star',shortcut:'S'}];
/** Tool strip above the drawing surface: tools, undo/redo and zoom. */
export function VectorToolbar({onFit}:{onFit:()=>void}){
 const {t}=useT();const s=useVectorSession();
 return <div className="media-bar flex items-center gap-1 border-b border-subtle px-3 py-1.5 text-[12px]" role="toolbar" aria-label={t('vector.toolbar')} data-testid="vector-toolbar">
  {TOOLS.map(({id,icon:Icon,key,shortcut})=><Button key={id} size="icon" className={s.tool===id?'bg-hover text-ink':''} aria-pressed={s.tool===id} aria-label={`${t(key)} (${shortcut})`} title={`${t(key)} (${shortcut})`} onClick={()=>setTool(id)} data-testid={`vector-toolbar-${id}`}><Icon size={16}/></Button>)}
  <span className="mx-1 h-5 w-px bg-line" aria-hidden="true"/>
  <Button size="icon" disabled={!s.canUndo} aria-label={t('vector.undo')} onClick={undo} data-testid="vector-undo"><Undo2 size={16}/></Button>
  <Button size="icon" disabled={!s.canRedo} aria-label={t('vector.redo')} onClick={redo} data-testid="vector-redo"><Redo2 size={16}/></Button>
  <span className="ml-auto flex items-center gap-1">
   <Button size="icon" aria-label={t('vector.zoomOut')} onClick={()=>setView(s.zoom/1.25)}><Minus size={16}/></Button>
   <span className="w-12 text-center tabular-nums text-ink-2" data-testid="vector-zoom">{Math.round(s.zoom*100)}%</span>
   <Button size="icon" aria-label={t('vector.zoomIn')} onClick={()=>setView(s.zoom*1.25)}><Plus size={16}/></Button>
   <Button size="icon" aria-label={t('vector.zoomFit')} onClick={onFit} data-testid="vector-zoom-fit"><ZoomIn size={16}/></Button>
  </span></div>;}
