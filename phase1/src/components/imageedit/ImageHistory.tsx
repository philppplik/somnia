import {Eye,EyeOff,Trash2} from '../../lib/icons';
import {useT} from '../../lib/useT';
import {opLabelKey,timeline,type OpLike,type SnapLike} from '../../lib/imageedit/historyView';
export interface ImageHistoryProps{past:readonly SnapLike[];now:SnapLike;future:readonly SnapLike[];disabled?:boolean;onJump(index:number):void;onToggle(id:string):void;onRemove(id:string):void}
/** Timeline of every state (click to restore, later states stay as redo) plus the applied operations (toggle/remove). */
export function ImageHistory(p:ImageHistoryProps){
 const {t}=useT();const rows=timeline(p.past,p.now,p.future);const ops:readonly OpLike[]=p.now.stack;
 return <details className="image-editor-history" aria-label={t('imageeditor.history.title')} data-testid="image-editor-history" open={p.past.length>0||p.future.length>0}>
  <summary>{t('imageeditor.history.title')} ({p.past.length+1+p.future.length})</summary>
  <ol className="ieh-timeline">{rows.map(r=><li key={r.index} data-future={r.future}><button type="button" disabled={p.disabled} aria-current={r.current?'step':undefined} onClick={()=>p.onJump(r.index)}><span className="ieh-step">{r.index}</span><span>{t(r.labelKey)}</span></button></li>)}</ol>
  <h3>{t('imageeditor.history.operations')}</h3>
  {!ops.length&&<p className="ieh-hint">{t('imageeditor.history.none')}</p>}
  <ul className="ieh-ops">{ops.map(o=>{const label=t(opLabelKey(o.type));return <li key={o.id}>
   <button type="button" className="ieh-icon" disabled={p.disabled} aria-pressed={o.enabled} aria-label={t('imageeditor.history.toggleNamed',{name:label})} title={t('imageeditor.history.toggleNamed',{name:label})} onClick={()=>p.onToggle(o.id)}>{o.enabled?<Eye size={16}/>:<EyeOff size={16}/>}</button>
   <span className="ieh-name" data-off={!o.enabled}>{label}</span>
   <button type="button" className="ieh-icon" disabled={p.disabled} aria-label={t('imageeditor.history.removeNamed',{name:label})} title={t('imageeditor.history.removeNamed',{name:label})} onClick={()=>p.onRemove(o.id)}><Trash2 size={16}/></button>
  </li>;})}</ul>
 </details>;
}
