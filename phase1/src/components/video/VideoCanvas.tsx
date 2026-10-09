import {Film} from '../../lib/icons';
import {Button} from '../ui/button';
import {FileTabs} from '../FileTabs';
import {useT} from '../../lib/useT';
import {openVideoDialog} from '../../lib/video/open';
import {useMedia} from '../../lib/media';
import {VideoWorkspace} from './VideoWorkspace';
/** Canvas of the Video Studio: the opened video file, or a start screen. */
export function VideoCanvas(){
 const {t}=useT();const media=useMedia();const item=media.items.find(i=>i.name===media.active);
 return <main className="center" aria-label={t('video.title')}><div className="workspace"><section className="code-pane" aria-label={t('video.title')}>
  <FileTabs/>
  {item?.kind==='video'?<VideoWorkspace key={item.name} item={item}/>:
   <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center" data-testid="video-start">
    <Film size={36} className="text-ink-3"/>
    <div><h1 className="m-0 text-[18px] font-semibold text-ink">{t('video.start.title')}</h1><p className="mx-auto mt-2 max-w-[420px] text-[13px] text-ink-2">{t('video.start.body')}</p></div>
    <Button variant="primary" onClick={()=>void openVideoDialog()} data-testid="video-open">{t('video.start.open')}</Button>
    <p className="text-[11px] text-ink-3">{t('video.start.drop')}</p>
   </div>}
 </section></div></main>;
}
