import {useMemo} from 'react';
import {Button} from '../ui/button';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {missingAltText} from '../../lib/slides/deckPackage';

/** Pictures without alt text. Opening one shows its slide and selects it; the alt field is in the toolbar. Read-only. */
export function SlidesAltReport(){
  const s=useSlidesSession(),t=useSlidesPanelText();
  const rep=useMemo(()=>{if(!s.working)return null;try{return missingAltText(s.working);}catch{return null;}},[s.working]);
  if(!rep)return null;
  const open=async(slideIndex:number,slideId:number,shapeId:number)=>{
    const r=await commandDispatcher.tryRunCommand('slides.showSlide',{index:slideIndex},{origin:'ui'});
    if(r.ok)await commandDispatcher.tryRunCommand('slides.selectShape',{source:s.source,slideId,shapeId},{origin:'ui'});
  };
  if(!rep.total)return <p className="px-4 py-2 text-xs text-ink-3">{t('slides.altReport.none')}</p>;
  return <div className="flex flex-col gap-1 px-4 py-2">
    <p className="text-xs text-ink-2">{t('slides.altReport.count',{count:rep.total})}</p>
    {rep.items.map(i=><Button key={`${i.slideId}:${i.shapeId}`} size="compact" variant="outline" className="justify-start" disabled={s.busy||s.presenting} onClick={()=>void open(i.slideIndex,i.slideId,i.shapeId)}>{t('slides.altReport.item',{slide:i.slideIndex+1,name:i.name})}</Button>)}
    {rep.total>rep.items.length&&<p className="text-xs text-ink-3">{t('slides.altReport.more',{count:rep.total-rep.items.length})}</p>}
  </div>;
}
