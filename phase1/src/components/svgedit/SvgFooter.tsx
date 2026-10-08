import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {patchUi,useSvgUi,useCursor} from '../../lib/svgedit/store';
import {ZoomIn,ZoomOut,Fullscreen} from '../../lib/icons';
export function SvgFooter({size,zoom,onFit}:{size:{w:number;h:number}|null;zoom:number;onFit:()=>void}){
 const {t}=useT();const ui=useSvgUi();const cur=useCursor();
 return <div className="svg-footer" data-testid="svg-footer">
  <Button size="icon" className="!size-6" aria-label={t('svg.zoomOut')} onClick={()=>patchUi({zoom:Math.max(0.05,zoom/1.25),fit:false})}><ZoomOut size={14}/></Button>
  <span className="w-12 text-center tabular-nums" data-testid="svg-zoom">{Math.round(zoom*100)}%</span>
  <Button size="icon" className="!size-6" aria-label={t('svg.zoomIn')} onClick={()=>patchUi({zoom:Math.min(32,zoom*1.25),fit:false})}><ZoomIn size={14}/></Button>
  <Button size="icon" className="!size-6" aria-label={t('svg.fit')} aria-pressed={ui.fit} onClick={onFit}><Fullscreen size={14}/></Button>
  <span className="grow"/>
  {ui.tool==='node'&&<span className="text-ink-3">{t('svg.nodeAddHint')}</span>}
  {ui.notice&&<span className="text-[11px] text-[var(--accent)]" role="status">{ui.notice}</span>}
  <span className="text-ink-3 tabular-nums">{cur?`${Math.round(cur.x*10)/10}, ${Math.round(cur.y*10)/10}`:''}</span>
  {size&&<span className="text-ink-3 tabular-nums">{Math.round(size.w*100)/100} × {Math.round(size.h*100)/100}</span>}
  <span className="text-ink-3">{t('svg.selected',{n:ui.selection.length})}</span>
 </div>;}
