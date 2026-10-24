import {useMemo} from 'react';
import {Button} from '../ui/button';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {untitledSlides,duplicateTitles} from '../../lib/slides/deckPackage';

/** Slides without a title, for navigation and screen readers. Read-only; opening one shows the slide. */
export function SlidesTitleReport(){
  const s=useSlidesSession(),t=useSlidesPanelText();
  const rep=useMemo(()=>{if(!s.working)return null;try{return untitledSlides(s.working);}catch{return null;}},[s.working]);
  const dup=useMemo(()=>{if(!s.working)return null;try{return duplicateTitles(s.working);}catch{return null;}},[s.working]);
  if(!rep)return null;
  const go=(index:number)=>void commandDispatcher.tryRunCommand('slides.showSlide',{index},{origin:'ui'});
  const dups=dup&&dup.total>0&&<div className="flex flex-col gap-1">
    <p className="text-xs text-ink-2">{t('slides.titleReport.dupCount',{count:dup.total})}</p>
    {dup.items.map(g=><Button key={g.slides[0].slideId} size="compact" variant="outline" className="justify-start" disabled={s.busy||s.presenting} onClick={()=>go(g.slides[0].slideIndex)}>{t('slides.titleReport.dup',{title:g.title,slides:g.slides.slice(0,12).map(x=>x.slideIndex+1).join(', ')+(g.slides.length>12?'…':'')})}</Button>)}
    {dup.total>dup.items.length&&<p className="text-xs text-ink-3">{t('slides.altReport.more',{count:dup.total-dup.items.length})}</p>}
  </div>;
  if(!rep.total)return <div className="flex flex-col gap-1 px-4 py-2"><p className="text-xs text-ink-3">{t('slides.titleReport.none')}</p>{dups}</div>;
  return <div className="flex flex-col gap-1 px-4 py-2">
    <p className="text-xs text-ink-2">{t('slides.titleReport.count',{count:rep.total})}</p>
    {rep.items.map(i=><Button key={i.slideId} size="compact" variant="outline" className="justify-start" disabled={s.busy||s.presenting} onClick={()=>go(i.slideIndex)}>{t(i.reason==='missing'?'slides.titleReport.missing':'slides.titleReport.empty',{slide:i.slideIndex+1})}</Button>)}
    {rep.total>rep.items.length&&<p className="text-xs text-ink-3">{t('slides.altReport.more',{count:rep.total-rep.items.length})}</p>}
    {dups}
  </div>;
}
