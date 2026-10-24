import {useEffect,useMemo,useState} from 'react';
import {NativeInput} from '../ui/native-controls';
import {Button} from '../ui/button';
import {Checkbox} from '../ui/checkbox';
import {NumberField} from '../ui/number-field';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {readSlideFooter,readFirstSlideNum,MAX_FIRST_SLIDE_NUM,footerTextIssue,MAX_FOOTER_TEXT} from '../../lib/slides/deckPackage';

/** Slide number and footer text of the current slide, or of every slide. Each action is one command, so one undo step. */
export function SlidesFooterEditor(){
  const s=useSlidesSession(),t=useSlidesPanelText(),slideId=s.slideIds[s.index];
  const f=useMemo(()=>{if(!s.working||slideId===undefined)return null;try{return readSlideFooter(s.working,slideId);}catch{return null;}},[s.working,slideId]);
  const [num,setNum]=useState(false),[text,setText]=useState(''),[dateText,setDateText]=useState(''),[error,setError]=useState('');
  useEffect(()=>{if(f?.editable){setNum(f.number);setText(f.footer??'');setDateText(f.date??'');}setError('');},[f,slideId]);
  const first=useMemo(()=>{if(!s.working)return null;try{return readFirstSlideNum(s.working);}catch{return null;}},[s.working]);
  if(!f)return null;
  if(!f.editable)return <p className="px-4 py-2 text-xs text-ink-3">{f.problem}</p>;
  const ready=!s.busy&&!s.presenting,trimmed=text.trim()===''?null:text,issue=trimmed===null?'':footerTextIssue(trimmed),dtr=dateText.trim()===''?null:dateText,dIssue=dtr===null?'':footerTextIssue(dtr);
  const blocked=(num&&!f.number&&!f.canNumber)||(trimmed!==null&&f.footer===null&&!f.canFooter)||(dtr!==null&&f.date===null&&!f.canDate);
  const run=(all:boolean)=>void commandDispatcher.tryRunCommand(all?'slides.setAllSlideFooters':'slides.setSlideFooter',all?{source:s.source,number:num,footer:trimmed,date:dtr}:{source:s.source,slideId,number:num,footer:trimmed,date:dtr},{origin:'ui'}).then(r=>setError(r.ok?'':r.error.message));
  const parseFirst=(d:string)=>{const n=Number(d.trim());return /^\d{1,4}$/.test(d.trim())&&Number.isInteger(n)&&n<=MAX_FIRST_SLIDE_NUM?{ok:true as const,value:n}:{ok:false as const,error:t('slides.firstNum.invalid')};};
  const setFirst=(v:number)=>void commandDispatcher.tryRunCommand('slides.setFirstSlideNumber',{source:s.source,value:v},{origin:'ui'}).then(r=>setError(r.ok?'':r.error.message));
  return <div className="flex flex-col gap-2 px-4 py-2">
    {first!==null&&<div className="w-40"><NumberField label={t('slides.firstNum.label')} value={first} resetKey={`f:${first}`} min={0} max={MAX_FIRST_SLIDE_NUM} parse={parseFirst} constraintError={t('slides.firstNum.invalid')} disabled={!s.working||s.busy||s.presenting} onCommit={v=>{if(v!==first)setFirst(v);}}/></div>}
    <Checkbox label={t('slides.footer.number')} checked={num} disabled={!ready} onChange={e=>setNum(e.target.checked)}/>
    <div className="flex flex-wrap items-center gap-2">
      <NativeInput aria-label={t('slides.footer.date')} placeholder={t('slides.footer.date')} maxLength={MAX_FOOTER_TEXT} className="w-40" value={dateText} disabled={!ready} onChange={e=>setDateText(e.target.value)}/>
      <NativeInput aria-label={t('slides.footer.text')} placeholder={t('slides.footer.text')} maxLength={MAX_FOOTER_TEXT} className="w-72" value={text} disabled={!ready} onChange={e=>setText(e.target.value)}/>
      <Button size="compact" variant="outline" disabled={!ready||!!issue||!!dIssue||blocked||(num===f.number&&trimmed===f.footer&&dtr===f.date)} onClick={()=>run(false)}>{t('slides.footer.apply')}</Button>
      <Button size="compact" variant="outline" disabled={!ready||!!issue||!!dIssue} onClick={()=>run(true)}>{t('slides.footer.applyAll')}</Button>
    </div>
    {(issue||dIssue)&&<p className="text-xs text-danger">{t('slides.footer.invalid')}</p>}
    {blocked&&<p className="text-xs text-ink-3">{t('slides.footer.unavailable')}</p>}
    {error&&<p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
