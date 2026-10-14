import {useState} from 'react';
import {Trash2,Plus} from '../../../lib/icons';
import {useT} from '../../../lib/useT';
import {usePanelState} from '../../../store/panelStateStore';
import {BUILT_IN_PRESETS,MAX_PRESET_NAME,MAX_USER_PRESETS,addUserPreset,isNeutralLook,parseUserPresets,removeUserPreset,type UserPreset} from '../../../lib/photos/presets';
import {Button} from '../../ui/button';
import {PanelBody,SectionHead,isBusy,runPhotos} from './shared';
import {NativeInput} from '../../ui/native-controls';
let counter=0;
const newId=()=>`u${Date.now().toString(36)}${(counter++).toString(36)}`;
/** Built-in looks plus the user's own, saved from the current settings. Geometry is never part of a look. */
export function PresetsPanel(){
 const {t}=useT();
 const [raw,setRaw]=usePanelState<unknown>('photos.presets.user',[]);
 const [name,setName]=useState('');
 const user:UserPreset[]=parseUserPresets(raw);
 return <PanelBody testId="photos-presets-panel">{({session})=>{
  const busy=isBusy(session);const canSave=!busy&&!isNeutralLook(session.now)&&name.trim().length>0&&user.length<MAX_USER_PRESETS+(user.some(p=>p.name.toLowerCase()===name.trim().toLowerCase())?1:0);
  return <>
   <SectionHead title={t('photos.p.presets.builtIn')}/>
   <div className="grid grid-cols-2 gap-1" data-testid="photos-presets-builtin">
    {BUILT_IN_PRESETS.map(p=><Button key={p.id} size="compact" variant="outline" disabled={busy} onClick={()=>void runPhotos('photos.applyLook',{preset:p.id})} data-testid={`photos-preset-${p.id}`}>{t(p.labelKey)}</Button>)}
   </div>
   <SectionHead title={t('photos.p.presets.mine')}/>
   {user.length===0&&<p className="m-0 text-ink-3" data-testid="photos-presets-none">{t('photos.p.presets.none')}</p>}
   <ul className="m-0 grid list-none gap-1 p-0" data-testid="photos-presets-user">
    {user.map(p=><li key={p.id} className="flex items-center gap-1">
     <Button size="compact" variant="outline" className="min-w-0 flex-1 justify-start" disabled={busy} onClick={()=>void runPhotos('photos.applyLook',{look:p.look})} data-testid={`photos-user-preset-${p.id}`}><span className="truncate">{p.name}</span></Button>
     <Button size="icon" variant="ghost" className="size-7" aria-label={t('photos.p.presets.delete',{name:p.name})} onClick={()=>setRaw(removeUserPreset(user,p.id))}><Trash2 size={13}/></Button>
    </li>)}
   </ul>
   <form className="flex items-center gap-1" onSubmit={e=>{e.preventDefault();if(canSave){setRaw(addUserPreset(user,name,session.now,newId));setName('');}}}>
    <NativeInput value={name} onChange={e=>setName(e.target.value)} maxLength={MAX_PRESET_NAME} placeholder={t('photos.p.presets.namePlaceholder')} aria-label={t('photos.p.presets.name')}
     className="h-7 min-w-0 flex-1 rounded-sm border border-line bg-elevated px-2 text-[11px] text-ink" data-testid="photos-preset-name"/>
    <Button type="submit" size="compact" variant="outline" disabled={!canSave} data-testid="photos-preset-save"><Plus size={13}/>{t('photos.p.presets.save')}</Button>
   </form>
   <p className="m-0 text-[11px] text-ink-3">{t('photos.p.presets.note')}</p>
  </>;
 }}</PanelBody>;
}
