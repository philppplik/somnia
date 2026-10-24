import {ArrowDown,ArrowUp} from 'lucide-react';
import {Button} from '../ui/button';
import {IconButton} from '../ui/icon-button';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';

const MAX_ROWS=200;
/** Top-level objects of the viewed slide in reading order (screen readers follow document order, which is also the stacking order). Moving one is one arrange step, so one undo. */
export function SlidesReadingOrder(){
  const s=useSlidesSession(),t=useSlidesPanelText(),slideId=s.slideIds[s.index];
  const slide=s.model?.slides.find(x=>x.id===slideId);
  if(!slide||slide.problems.length)return null;
  const shapes=slide.shapes.filter(x=>x.parentId===null);
  if(!shapes.length)return <p className="px-4 py-2 text-xs text-ink-3">{t('slides.reading.none')}</p>;
  const pick=(shapeId:number)=>commandDispatcher.tryRunCommand('slides.selectShape',{source:s.source,slideId,shapeId},{origin:'ui'});
  const move=async(shapeId:number,mode:'backward'|'forward')=>{const r=await pick(shapeId);if(r.ok)await commandDispatcher.tryRunCommand('slides.arrangeShapes',{mode},{origin:'ui'});};
  const off=s.busy||s.presenting;
  return <ol className="flex flex-col gap-1 px-4 py-2" aria-label={t('slides.reading.title')}>
    {shapes.slice(0,MAX_ROWS).map((x,i)=><li key={x.id} className="flex items-center gap-1">
      <Button size="compact" variant="outline" className="min-w-0 flex-1 justify-start" disabled={off} onClick={()=>void pick(x.id)}><span className="truncate">{i+1}. {x.name||`#${x.id}`}</span></Button>
      <IconButton size="row" variant="outline" aria-label={`${t('slides.reading.earlier')} (${x.name})`} disabled={off||i===0} onClick={()=>void move(x.id,'backward')}><ArrowUp aria-hidden/></IconButton>
      <IconButton size="row" variant="outline" aria-label={`${t('slides.reading.later')} (${x.name})`} disabled={off||i===shapes.length-1} onClick={()=>void move(x.id,'forward')}><ArrowDown aria-hidden/></IconButton>
    </li>)}
    {shapes.length>MAX_ROWS&&<p className="text-xs text-ink-3">{t('slides.altReport.more',{count:shapes.length-MAX_ROWS})}</p>}
  </ol>;
}
