import {useEffect,useMemo,useState} from 'react';
import {NativeInput} from '../ui/native-controls';
import {Button} from '../ui/button';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {readPictureAlt,altTextIssue,MAX_ALT_TEXT} from '../../lib/slides/deckPackage';

/** Alt text of the selected picture. Empty text removes it. One command, one undo step. */
export function SlidesAltTextField({slideId,shapeId,disabled}:{slideId:number;shapeId:number;disabled:boolean}){
  const s=useSlidesSession(),t=useSlidesPanelText();
  const cur=useMemo(()=>{if(!s.working)return null;try{return readPictureAlt(s.working,slideId,shapeId)??'';}catch{return null;}},[s.working,slideId,shapeId]);
  const [text,setText]=useState(''),[error,setError]=useState('');
  useEffect(()=>{setText(cur??'');setError('');},[cur,slideId,shapeId]);
  if(cur===null)return null;
  const next=text===''?null:text,issue=next===null?'':altTextIssue(next);
  return <>
    <div className="w-56"><NativeInput aria-label={t('slides.alt.label')} placeholder={t('slides.alt.label')} maxLength={MAX_ALT_TEXT} value={text} disabled={disabled} onChange={e=>setText(e.target.value)}/></div>
    <Button size="compact" variant="outline" disabled={disabled||!!issue||text===cur} onClick={()=>void commandDispatcher.tryRunCommand('slides.setAltText',{source:s.source,slideId,shapeId,alt:next},{origin:'ui'}).then(r=>setError(r.ok?'':r.error.message))}>{t('slides.alt.apply')}</Button>
    {issue&&<span className="text-xs text-danger">{t('slides.alt.invalid')}</span>}
    {error&&<span role="alert" className="text-xs text-danger">{error}</span>}
  </>;
}
