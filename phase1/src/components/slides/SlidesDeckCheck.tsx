import {useMemo} from 'react';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {untitledSlides,duplicateTitles,missingAltText,slidesWithoutNotes,emptySlides,smallTextSlides,readHiddenSlides} from '../../lib/slides/deckPackage';

/** One-glance counts of the deck checks below (titles, duplicate titles, alt text, notes) plus hidden slides. Read-only. */
export function SlidesDeckCheck(){
  const s=useSlidesSession(),t=useSlidesPanelText();
  const c=useMemo(()=>{
    if(!s.working)return null;
    try{return {titles:untitledSlides(s.working).total,dups:duplicateTitles(s.working).total,alt:missingAltText(s.working).total,notes:slidesWithoutNotes(s.working).total,empty:emptySlides(s.working).total,small:smallTextSlides(s.working).total,hidden:readHiddenSlides(s.working).filter(Boolean).length};}catch{return null;}
  },[s.working]);
  if(!c)return null;
  const rows:[string,number][]=[['slides.deckCheck.titles',c.titles],['slides.deckCheck.dups',c.dups],['slides.deckCheck.alt',c.alt],['slides.deckCheck.notes',c.notes],['slides.deckCheck.empty',c.empty],['slides.deckCheck.small',c.small],['slides.deckCheck.hidden',c.hidden]];
  const issues=c.titles+c.dups+c.alt+c.notes+c.empty+c.small;
  return <section aria-label={t('slides.deckCheck.title')} data-slot="slides-deck-check" className="rounded-lg border border-subtle px-3 py-2">
    <p className="text-xs font-medium">{t('slides.deckCheck.title')}{issues===0&&<span className="ml-2 font-normal text-ink-3">{t('slides.deckCheck.clear')}</span>}</p>
    <ul className="mt-1 grid grid-cols-[1fr_auto] gap-x-4 text-xs text-ink-2">{rows.map(([k,n])=><li key={k} className="col-span-2 grid grid-cols-subgrid"><span>{t(k)}</span><span className={n&&k!=='slides.deckCheck.hidden'?'font-medium text-ink':'text-ink-3'}>{n}</span></li>)}</ul>
  </section>;
}
