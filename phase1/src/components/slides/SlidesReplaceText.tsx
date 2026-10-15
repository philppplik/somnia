import {useMemo,useState} from 'react';
import {NativeInput} from '../ui/native-controls';
import {Button} from '../ui/button';
import {Checkbox} from '../ui/checkbox';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {countTextMatches,replaceSkippedSlides,textMatchesBySlide,findTextIssue,replaceTextIssue,MAX_FIND_TEXT,MAX_REPLACE_TEXT,MAX_REPLACEMENTS} from '../../lib/slides/deckPackage';

/** Find and replace across all slides, inside single text runs. The count is shown before anything changes; one replace is one undo step. */
export function SlidesReplaceText(){
  const s=useSlidesSession(),t=useSlidesPanelText();
  const [find,setFind]=useState(''),[repl,setRepl]=useState(''),[matchCase,setCase]=useState(false),[error,setError]=useState(''),[done,setDone]=useState('');
  const issue=find?findTextIssue(find)||replaceTextIssue(repl):replaceTextIssue(repl);
  const count=useMemo(()=>{if(!s.working||!find||findTextIssue(find))return 0;try{return countTextMatches(s.working,find,matchCase);}catch{return 0;}},[s.working,find,matchCase]);
  const rows=useMemo(()=>{if(!s.working||!find||findTextIssue(find))return [];try{return textMatchesBySlide(s.working,find,matchCase).slice(0,50);}catch{return [];}},[s.working,find,matchCase]);
  const skipped=useMemo(()=>{if(!s.working)return 0;try{return replaceSkippedSlides(s.working);}catch{return 0;}},[s.working]);
  const ready=!!s.working&&!s.busy&&!s.presenting,tooMany=count>MAX_REPLACEMENTS;
  const apply=async()=>{
    setError('');setDone('');const n=count;
    const r=await commandDispatcher.tryRunCommand('slides.replaceText',{source:s.source,find,replacement:repl,matchCase,expectedCount:n},{origin:'ui'});
    if(r.ok)setDone(t('slides.replace.done',{count:n}));else setError(r.error.message);
  };
  return <div className="flex flex-col gap-2 px-4 py-2">
    <NativeInput aria-label={t('slides.replace.find')} placeholder={t('slides.replace.find')} maxLength={MAX_FIND_TEXT} value={find} disabled={!ready} onChange={e=>{setFind(e.target.value);setDone('');}}/>
    <NativeInput aria-label={t('slides.replace.with')} placeholder={t('slides.replace.with')} maxLength={MAX_REPLACE_TEXT} value={repl} disabled={!ready} onChange={e=>{setRepl(e.target.value);setDone('');}}/>
    <Checkbox label={t('slides.replace.matchCase')} className="!w-4 shrink-0" checked={matchCase} disabled={!ready} onChange={e=>setCase(e.target.checked)}/>
    <div className="flex items-center gap-2">
      <Button size="compact" variant="outline" disabled={!ready||!!issue||count<1||tooMany} onClick={()=>void apply()}>{t('slides.replace.apply')}</Button>
      {find&&!issue&&<span className="text-xs text-ink-2" role="status">{tooMany?t('slides.replace.tooMany',{max:MAX_REPLACEMENTS}):t('slides.replace.count',{count})}</span>}
      {issue&&<span className="text-xs text-danger">{t('slides.replace.invalid')}</span>}
    </div>
    {rows.length>0&&<ul className="flex max-h-32 flex-col gap-1 overflow-y-auto" aria-label={t('slides.replace.where')}>{rows.map(r=><li key={r.slideIndex}><Button size="compact" variant="ghost" disabled={!ready} onClick={()=>void commandDispatcher.tryRunCommand('slides.showSlide',{index:r.slideIndex},{origin:'ui'})}>{t('slides.replace.row',{number:r.slideIndex+1,count:r.count})}</Button></li>)}</ul>}
    {find&&!issue&&skipped>0&&<p className="text-xs text-ink-3" role="note">{t('slides.replace.skipped',{count:skipped})}</p>}
    {done&&<p role="status" className="text-xs text-ink-2">{done}</p>}
    {error&&<p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
