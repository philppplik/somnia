import type {ReactNode} from 'react';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {SlidesThemeEditor} from './SlidesThemeEditor';
import {SlidesMasterEditor} from './SlidesMasterEditor';
import {SlidesBackgroundEditor} from './SlidesBackgroundEditor';
import {SlidesSizeEditor} from './SlidesSizeEditor';
import {SlidesFooterEditor} from './SlidesFooterEditor';

/** One collapsed section for the deck-wide design panels, so the panel stack stays short. */
export function SlidesDesignGroup(){
  const t=useSlidesPanelText();
  const part=(title:Parameters<ReturnType<typeof useSlidesPanelText>>[0],body:ReactNode)=><details className="shrink-0 border-t border-subtle"><summary className="px-6 py-2">{t(title)}</summary>{body}</details>;
  return <details className="max-h-[28rem] shrink-0 overflow-auto border-t border-subtle"><summary className="px-4 py-2">{t('slides.design.title')}</summary>
    {part('slides.theme.title',<SlidesThemeEditor/>)}
    {part('slides.master.title',<SlidesMasterEditor/>)}
    {part('slides.background.title',<SlidesBackgroundEditor/>)}
    {part('slides.size.title',<SlidesSizeEditor/>)}
    {part('slides.footer.title',<SlidesFooterEditor/>)}
  </details>;
}
