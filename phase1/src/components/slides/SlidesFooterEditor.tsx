import {useEffect,useMemo,useState} from 'react';
import {NativeInput} from '../ui/native-controls';
import {Button} from '../ui/button';
import {Checkbox} from '../ui/checkbox';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {readSlideFooter,footerTextIssue,MAX_FOOTER_TEXT} from '../../lib/slides/deckPackage';

/** Slide number and footer text of the current slide, or of every slide. Each action is one command, so one undo step. */
export function SlidesFooterEditor(){
  const s=useSlidesSession(),t=useSlidesPanelText(),slideId=s.slideIds[s.index];
  const f=useMemo(()=>{if(!s.working||slideId===undefined)return null;try{return readSlideFooter(s.working,slideId);}catch{return null;}},[s.working,slideId]);
  const [num,setNum]=useState(false),[text,setText]=useState(''),[error,setError]=useState('');
  useEffect(()=>{if(f?.editable){setNum(f.number);setText(f.footer??'');}setError('');},[f,slideId]);
  if(!f)return null;
  if(!f.editable)return <p className="px-4 py-2 text-xs text-ink-3">{f.problem}</p>;
  const ready=!s.busy&&!s.presenting,trimmed=text.trim()===''?null:text,issue=trimmed===null?'':footerTextIssue(trimmed);
  const blocked=(num&&!f.number&&!f.canNumber)||(trimmed!==null&&f.footer===null&&!f.canFooter);
  const run=(all:boolean)=>void commandDispatcher.tryRunCommand(all?'slides.setAllSlideFooters':'slides.setSlideFooter',all?{source:s.source,number:num,footer:trimmed}:{source:s.source,slideId,number:num,footer:trimmed},{origin:'ui'}).then(r=>setError(r.ok?'':r.error.message));
  return <div className="flex flex-col gap-2 px-4 py-2">
    <Checkbox label={t('slides.footer.number')} checked={num} disabled={!ready} onChange={e=>setNum(e.target.checked)}/>
    <div className="flex flex-wrap items-center gap-2">
      <NativeInput aria-label={t('slides.footer.text')} placeholder={t('slides.footer.text')} maxLength={MAX_FOOTER_TEXT} className="w-72" value={text} disabled={!ready} onChange={e=>setText(e.target.value)}/>
      <Button size="compact" variant="outline" disabled={!ready||!!issue||blocked||(num===f.number&&trimmed===f.footer)} onClick={()=>run(false)}>{t('slides.footer.apply')}</Button>
      <Button size="compact" variant="outline" disabled={!ready||!!issue} onClick={()=>run(true)}>{t('slides.footer.applyAll')}</Button>
    </div>
    {issue&&<p className="text-xs text-danger">{t('slides.footer.invalid')}</p>}
    {blocked&&<p className="text-xs text-ink-3">{t('slides.footer.unavailable')}</p>}
    {error&&<p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
