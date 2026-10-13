import {Redo2,Undo2} from '../../../lib/icons';
import {useT} from '../../../lib/useT';
import {historyEntries,type SettingChange} from '../../../lib/photos/historyLog';
import {PHOTO_CONTROLS} from '../../../lib/photos/studioSettings';
import {Button} from '../../ui/button';
import {PanelBody,SectionHead,runPhotos} from './shared';
const labelKey=(key:string)=>PHOTO_CONTROLS.find(c=>c.key===key)?.label??`photos.p.key.${key}`;
const fmt=(v:unknown)=>typeof v==='number'?String(Math.round(v*100)/100):typeof v==='boolean'?(v?'on':'off'):v===null?'-':'';
/** One line per undo step: what changed, in words. Click a row to jump there; the undone steps stay redoable. */
export function changeSummary(changes:SettingChange[],t:(k:string,p?:Record<string,string|number>)=>string):string{
 if(changes.length===0)return t('photos.p.history.noChange');
 const shown=changes.slice(0,3).map(c=>{
  if(c.key==='crop')return c.to===null?t('photos.p.history.cropRemoved'):t('photos.p.history.cropSet');
  if(c.key==='orientation')return t('photos.p.history.rotated');
  if(c.key==='flipH'||c.key==='flipV')return t(c.key==='flipH'?'photos.flipH':'photos.flipV');
  return `${t(labelKey(c.key))} ${fmt(c.from)} → ${fmt(c.to)}`;
 });
 return shown.join(', ')+(changes.length>3?` +${changes.length-3}`:'');
}
export function HistoryPanel(){
 const {t}=useT();
 return <PanelBody testId="photos-history-panel">{({session})=>{
  const entries=historyEntries(session);
  return <>
   <SectionHead>
    <Button size="icon" variant="outline" className="size-7" aria-label={t('photos.undo')} disabled={session.past.length===0} onClick={()=>void runPhotos('photos.undo')} data-testid="photos-p-undo"><Undo2 size={13}/></Button>
    <Button size="icon" variant="outline" className="size-7" aria-label={t('photos.redo')} disabled={session.future.length===0} onClick={()=>void runPhotos('photos.redo')} data-testid="photos-p-redo"><Redo2 size={13}/></Button>
   </SectionHead>
   <ol className="m-0 grid list-none gap-0.5 p-0" data-testid="photos-history-list" aria-label={t('photos.panel.history')}>
    {[...entries].reverse().map(e=><li key={e.index}>
     <button type="button" aria-current={e.current?'step':undefined} onClick={()=>void runPhotos('photos.history.jump',{index:e.index})} data-testid={`photos-history-${e.index}`}
      className={`w-full rounded-sm px-2 py-1 text-left text-[11px] hover:bg-hover ${e.current?'bg-hover text-ink':e.status==='undone'?'text-ink-3':'text-ink-2'}`}>
      <span className="tabular-nums text-ink-3">{e.index}. </span>{e.index===0?t('photos.p.history.opened'):changeSummary(e.changes,t)}
     </button>
    </li>)}
   </ol>
   <p className="m-0 text-[11px] text-ink-3">{t('photos.p.history.note')}</p>
  </>;
 }}</PanelBody>;
}
