import {useEffect,useMemo,useState} from 'react';
import {NativeInput} from '../ui/native-controls';
import {Button} from '../ui/button';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {readSlideBackground,backgroundSummary} from '../../lib/slides/deckPackage';

const HEX=/^[0-9A-F]{6}$/;
/** Solid background of the current slide, or follow the master. Each action is one command, so one undo step. */
export function SlidesBackgroundEditor(){
  const s=useSlidesSession(),t=useSlidesPanelText(),slideId=s.slideIds[s.index];
  const bg=useMemo(()=>{if(!s.working||slideId===undefined)return null;try{return readSlideBackground(s.working,slideId);}catch{return null;}},[s.working,slideId]);
  const sum=useMemo(()=>s.working?backgroundSummary(s.working):null,[s.working]);
  const [draft,setDraft]=useState(''),[error,setError]=useState('');
  useEffect(()=>{setDraft(bg?.kind==='solid'?bg.color:'');setError('');},[bg,slideId]);
  if(!bg)return null;
  if(bg.kind==='other')return <p className="px-4 py-2 text-xs text-ink-3">{t('slides.background.readonly')}</p>;
  const ready=!s.busy&&!s.presenting,hex=draft.toUpperCase().replace(/^#/,'');
  const run=(params:Record<string,unknown>)=>void commandDispatcher.tryRunCommand('slides.setSlideBackground',{source:s.source,slideId,...params},{origin:'ui'}).then(r=>setError(r.ok?'':r.error.message));
  const runAll=(params:Record<string,unknown>)=>void commandDispatcher.tryRunCommand('slides.setAllSlideBackgrounds',{source:s.source,...params},{origin:'ui'}).then(r=>setError(r.ok?'':r.error.message));
  return <div className="flex flex-wrap items-center gap-2 px-4 py-2">
    <NativeInput aria-label={t('slides.background.title')} maxLength={7} className="w-28" value={draft} onChange={e=>setDraft(e.target.value)}/>
    <Button size="compact" variant="outline" disabled={!ready||!HEX.test(hex)||(bg.kind==='solid'&&bg.color===hex)} onClick={()=>run({kind:'solid',color:hex})}>{t('slides.background.apply')}</Button>
    <Button size="compact" variant="ghost" disabled={!ready||bg.kind==='inherit'} onClick={()=>run({kind:'inherit'})}>{t('slides.background.inherit')}</Button>
    <Button size="compact" variant="outline" disabled={!ready||!HEX.test(hex)||!sum||sum.other>0} onClick={()=>runAll({kind:'solid',color:hex})}>{t('slides.background.all')}</Button>
    {sum&&sum.other>0&&<span className="text-xs text-ink-3">{t('slides.background.allBlocked',{count:sum.other})}</span>}
    {error&&<span role="alert" className="text-xs text-danger">{error}</span>}
  </div>;
}
