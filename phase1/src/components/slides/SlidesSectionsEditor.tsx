import {useMemo,useState} from 'react';
import {NativeInput} from '../ui/native-controls';
import {Button} from '../ui/button';
import {IconButton} from '../ui/icon-button';
import {ArrowDown,ArrowUp} from 'lucide-react';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {readDeckModel,sectionNameIssue,MAX_SECTION_NAME} from '../../lib/slides/deckPackage';

/** Sections of the deck: rename, merge into the section above, or start a new one at the current slide. Each action is one command, so one undo step. */
export function SlidesSectionsEditor(){
  const s=useSlidesSession(),t=useSlidesPanelText(),slideId=s.slideIds[s.index];
  const sections=useMemo(()=>{if(!s.working)return null;try{return readDeckModel(s.working).sections??[];}catch{return null;}},[s.working]);
  const [drafts,setDrafts]=useState<Record<string,string>>({}),[fresh,setFresh]=useState(''),[error,setError]=useState('');
  if(!sections)return null;
  const ready=!s.busy&&!s.presenting,newIssue=fresh===''?'':sectionNameIssue(fresh);
  const starts=slideId!==undefined&&sections.some(x=>x.ids[0]===slideId);
  const run=(id:string,params:Record<string,unknown>,done?:()=>void)=>void commandDispatcher.tryRunCommand(id,{source:s.source,...params},{origin:'ui'}).then(r=>{setError(r.ok?'':r.error.message);if(r.ok)done?.();});
  return <div className="flex flex-col gap-2 px-4 py-2">
    {!sections.length&&<p className="text-xs text-ink-3">{t('slides.sections.none')}</p>}
    {sections.map((sec,i)=>{const key=`${i}:${sec.name}`,name=drafts[key]??sec.name,issue=sectionNameIssue(name);
      return <div key={key} className="flex flex-wrap items-center gap-2">
        <NativeInput aria-label={`${t('slides.sections.name')} ${i+1}`} maxLength={MAX_SECTION_NAME} className="w-44" value={name} disabled={!ready} onChange={e=>setDrafts(d=>({...d,[key]:e.target.value}))}/>
        <Button size="compact" variant="outline" disabled={!ready||!!issue||name===sec.name} onClick={()=>run('slides.renameSection',{index:i,expectedName:sec.name,name},()=>setDrafts({}))}>{t('slides.sections.rename')}</Button>
        <IconButton size="row" variant="outline" aria-label={`${t('slides.sections.up')} (${sec.name})`} disabled={!ready||i===0} onClick={()=>run('slides.moveSection',{index:i,expectedName:sec.name,toIndex:i-1},()=>setDrafts({}))}><ArrowUp aria-hidden/></IconButton>
        <IconButton size="row" variant="outline" aria-label={`${t('slides.sections.down')} (${sec.name})`} disabled={!ready||i===sections.length-1} onClick={()=>run('slides.moveSection',{index:i,expectedName:sec.name,toIndex:i+1},()=>setDrafts({}))}><ArrowDown aria-hidden/></IconButton>
        <Button size="compact" variant="outline" disabled={!ready||sections.length<2} onClick={()=>run('slides.removeSection',{index:i,expectedName:sec.name},()=>setDrafts({}))}>{t('slides.sections.remove')}</Button>
      </div>;})}
    <div className="flex flex-wrap items-center gap-2">
      <NativeInput aria-label={t('slides.sections.add')} placeholder={t('slides.sections.add')} maxLength={MAX_SECTION_NAME} className="w-56" value={fresh} disabled={!ready} onChange={e=>setFresh(e.target.value)}/>
      <Button size="compact" variant="outline" disabled={!ready||slideId===undefined||fresh===''||!!newIssue||starts} onClick={()=>run('slides.addSection',{slideId,name:fresh},()=>setFresh(''))}>{t('slides.sections.add')}</Button>
    </div>
    {newIssue&&<p className="text-xs text-danger">{t('slides.sections.invalid')}</p>}
    {starts&&<p className="text-xs text-ink-3">{t('slides.sections.starts')}</p>}
    {error&&<p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
