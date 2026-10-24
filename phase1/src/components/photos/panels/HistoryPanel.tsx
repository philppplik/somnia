import {useState} from 'react';
import {Camera,Redo2,Trash2,Undo2} from '../../../lib/icons';
import {useT} from '../../../lib/useT';
import {usePanelState} from '../../../store/panelStateStore';
import {addVersion,isCurrentVersion,MAX_VERSION_NAME,MAX_VERSIONS_PER_PHOTO,parseVersionBook,removeVersion} from '../../../lib/photos/versions';
import {historyEntries,type SettingChange} from '../../../lib/photos/historyLog';
import {PHOTO_CONTROLS} from '../../../lib/photos/studioSettings';
import {Button} from '../../ui/button';
import {PanelBody,SectionHead,runPhotos} from './shared';
import {NativeButton,NativeInput} from '../../ui/native-controls';
let counter=0;
const newId=()=>`v${Date.now().toString(36)}${(counter++).toString(36)}`;
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
 const [book,setBook]=usePanelState<unknown>('photos.versions',{});
 const [vname,setVname]=useState('');
 return <PanelBody testId="photos-history-panel">{({name,session})=>{
  const entries=historyEntries(session);
  const versions=parseVersionBook(book)[name]??[];
  const busy=session.status!=='ready';
  const canSave=!busy&&vname.trim().length>0&&(versions.length<MAX_VERSIONS_PER_PHOTO||versions.some(v=>v.name.toLowerCase()===vname.trim().toLowerCase()));
  return <>
   <SectionHead>
    <Button size="icon" variant="outline" className="size-7" aria-label={t('photos.undo')} disabled={session.past.length===0} onClick={()=>void runPhotos('photos.undo')} data-testid="photos-p-undo"><Undo2 size={13}/></Button>
    <Button size="icon" variant="outline" className="size-7" aria-label={t('photos.redo')} disabled={session.future.length===0} onClick={()=>void runPhotos('photos.redo')} data-testid="photos-p-redo"><Redo2 size={13}/></Button>
   </SectionHead>
   <ol className="m-0 grid list-none gap-0.5 p-0" data-testid="photos-history-list" aria-label={t('photos.panel.history')}>
    {[...entries].reverse().map(e=><li key={e.index}>
     <NativeButton type="button" aria-current={e.current?'step':undefined} onClick={()=>void runPhotos('photos.history.jump',{index:e.index})} data-testid={`photos-history-${e.index}`}
      className={`w-full rounded-sm px-2 py-1 text-left text-[11px] hover:bg-hover ${e.current?'bg-hover text-ink':e.status==='undone'?'text-ink-3':'text-ink-2'}`}>
      <span className="tabular-nums text-ink-3">{e.index}. </span>{e.index===0?t('photos.p.history.opened'):changeSummary(e.changes,t)}
     </NativeButton>
    </li>)}
   </ol>
   <p className="m-0 text-[11px] text-ink-3">{t('photos.p.history.note')}</p>
   <SectionHead title={t('photos.p.versions.title')}>
    <span className="text-ink-3" data-testid="photos-versions-count">{versions.length}/{MAX_VERSIONS_PER_PHOTO}</span>
   </SectionHead>
   {versions.length===0&&<p className="m-0 text-ink-3" data-testid="photos-versions-none">{t('photos.p.versions.none')}</p>}
   <ul className="m-0 grid list-none gap-1 p-0" data-testid="photos-versions-list">
    {versions.map(v=><li key={v.id} className="flex items-center gap-1">
     <Button size="compact" variant="outline" className="min-w-0 flex-1 justify-start" disabled={busy} aria-current={isCurrentVersion(v,session.now)?'step':undefined}
      onClick={()=>void runPhotos('photos.applyVersion',{payload:v.payload})} data-testid={`photos-version-${v.id}`}><Camera size={12}/><span className="truncate">{v.name}</span></Button>
     <Button size="icon" variant="ghost" className="size-7" aria-label={t('photos.p.versions.delete',{name:v.name})} onClick={()=>setBook(removeVersion(parseVersionBook(book),name,v.id))} data-testid={`photos-version-delete-${v.id}`}><Trash2 size={13}/></Button>
    </li>)}
   </ul>
   <form className="flex items-center gap-1" onSubmit={e=>{e.preventDefault();if(canSave){setBook(addVersion(parseVersionBook(book),name,vname,session.now,newId));setVname('');}}}>
    <NativeInput value={vname} onChange={e=>setVname(e.target.value)} maxLength={MAX_VERSION_NAME} placeholder={t('photos.p.versions.namePlaceholder')} aria-label={t('photos.p.versions.name')}
     className="h-7 min-w-0 flex-1 rounded-sm border border-line bg-elevated px-2 text-ink" data-testid="photos-version-name"/>
    <Button type="submit" size="compact" variant="outline" disabled={!canSave} data-testid="photos-version-save">{t('photos.p.versions.save')}</Button>
   </form>
   <p className="m-0 text-ink-3">{t('photos.p.versions.note')}</p>
  </>;
 }}</PanelBody>;
}
