import {Film} from '../../lib/icons';
import {StudioEmptyState} from '../studios/StudioEmptyState';
import {createBlankProject} from '../../lib/studios/blank';
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
  {item&&(item.kind==='video'||item.kind==='video-project')?<VideoWorkspace key={item.name} item={item}/>:
   <StudioEmptyState studio="video" icon={<Film/>} onOpen={openVideoDialog} onCreate={()=>createBlankProject('video')}/>}
 </section></div></main>;
}
