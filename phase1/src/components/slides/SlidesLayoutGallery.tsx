import {useState} from 'react';
import {Button} from '../ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../ui/dialog';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import type {LayoutInfo} from '../../lib/slides/deckPackage';

/** Schematic of a layout: placeholder frames only. It shows where text goes, not how the slide will look. */
function LayoutSketch({layout,size}:{layout:LayoutInfo;size:{cx:number;cy:number}}){
  return <svg viewBox={`0 0 ${size.cx} ${size.cy}`} aria-hidden="true" className="!block !h-auto !w-full rounded border border-subtle bg-white">
    {layout.boxes.map((b,i)=><rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} className={b.type.toLowerCase().includes('title')?'fill-ink-2/40 stroke-ink-2':'fill-ink-2/15 stroke-ink-2'} strokeWidth={size.cx/400}/>)}
  </svg>;
}

/** Layout gallery for adding a slide: every layout of the deck, with a placeholder sketch. */
export function SlidesLayoutGallery(){
  const s=useSlidesSession(),t=useSlidesPanelText(),[open,setOpen]=useState(false),[change,setChange]=useState(false),[error,setError]=useState('');
  const currentId=s.slideIds[s.index],size=s.model?.slideSize??{cx:9144000,cy:6858000};
  const add=async(l:LayoutInfo)=>{
    setError('');
    const r=await commandDispatcher.tryRunCommand(change?'slides.changeLayout':'slides.newSlide',change?{source:s.source,slideId:currentId,layoutPart:l.part}:{source:s.source,layoutPart:l.part,afterSlideId:currentId},{origin:'ui'});
    if(r.ok)setOpen(false);else setError(r.error.message);
  };
  return <>
    <Button size="compact" variant="outline" disabled={s.busy||!s.layouts.some(l=>l.supported)||!s.slideIds.length} onClick={()=>{setError('');setChange(false);setOpen(true);}}>{t('slides.newFromLayout')}</Button>
    <Button size="compact" variant="outline" disabled={s.busy||s.layouts.length<2||!s.slideIds.length} onClick={()=>{setError('');setChange(true);setOpen(true);}}>{t('slides.changeLayout')}</Button>
    <Dialog open={open} onOpenChange={o=>{if(!o)setOpen(false);}}>
      <DialogContent className="diag-popup flex max-h-[90vh] w-[44rem] max-w-[92vw] flex-col gap-3 overflow-y-auto p-4" data-testid="slides-layout-gallery">
        <DialogTitle>{t(change?'slides.changeLayout.title':'slides.gallery.title')}</DialogTitle>
        <DialogDescription>{change?t('slides.changeLayout.desc',{number:s.index+1}):t('slides.gallery.desc',{number:s.index+2})}</DialogDescription>
        <ul className="m-0 grid list-none grid-cols-3 gap-3 p-0">
          {s.layouts.map(l=><li key={l.part}>
            <Button variant="outline" disabled={s.busy||(!change&&!l.supported)} onClick={()=>void add(l)} className="!grid h-auto w-full grid-cols-1 gap-1 p-2 text-left" aria-label={l.supported||change?l.name:t('slides.layoutUnsupported',{name:l.name})}>
              <span className="block w-full"><LayoutSketch layout={l} size={size}/></span>
              <span className="truncate text-xs">{l.supported||change?l.name:t('slides.layoutUnsupported',{name:l.name})}</span>
            </Button>
          </li>)}
        </ul>
        {error&&<p role="alert" className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end"><Button size="compact" variant="ghost" onClick={()=>setOpen(false)}>{t('slides.gallery.close')}</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
