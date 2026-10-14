import {useMemo} from 'react';
import {Button} from '../ui/button';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {untitledSlides} from '../../lib/slides/deckPackage';

/** Slides without a title, for navigation and screen readers. Read-only; opening one shows the slide. */
export function SlidesTitleReport(){
  const s=useSlidesSession(),t=useSlidesPanelText();
  const rep=useMemo(()=>{if(!s.working)return null;try{return untitledSlides(s.working);}catch{return null;}},[s.working]);
  if(!rep)return null;
  if(!rep.total)return <p className="px-4 py-2 text-xs text-ink-3">{t('slides.titleReport.none')}</p>;
  return <div className="flex flex-col gap-1 px-4 py-2">
    <p className="text-xs text-ink-2">{t('slides.titleReport.count',{count:rep.total})}</p>
    {rep.items.map(i=><Button key={i.slideId} size="compact" variant="outline" className="justify-start" disabled={s.busy||s.presenting} onClick={()=>void commandDispatcher.tryRunCommand('slides.showSlide',{index:i.slideIndex},{origin:'ui'})}>{t(i.reason==='missing'?'slides.titleReport.missing':'slides.titleReport.empty',{slide:i.slideIndex+1})}</Button>)}
    {rep.total>rep.items.length&&<p className="text-xs text-ink-3">{t('slides.altReport.more',{count:rep.total-rep.items.length})}</p>}
  </div>;
}
