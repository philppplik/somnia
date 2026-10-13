import {useEffect,useRef} from 'react';
import {studioContextStore} from '../../lib/shell/studioContext';
import {registerVideoCommands} from '../../lib/video/commands';
import {isTitleClip} from '../../lib/video/titles';
import {useVideoSession,videoIsEdited,videoTimelineDuration} from '../../lib/video/session';
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
 const {t}=useT();const media=useMedia();const active=media.items.find(i=>i.name===media.active);
 const item=active&&(active.kind==='video'||active.kind==='video-project')?active:undefined;
 const session=useVideoSession(item?.name);
 const claim=useRef<ReturnType<typeof studioContextStore.claim>|null>(null);
 useEffect(()=>registerVideoCommands(),[]);
 useEffect(()=>{const owner=studioContextStore.claim('video',item?{id:item.name,kind:item.kind,dirty:false,readOnly:false}:undefined);claim.current=owner;return()=>{owner.release();claim.current=null;};},[item?.name]);
 useEffect(()=>{
  const selected=session?.clips.find(c=>c.id===session.selectedClipId);
  claim.current?.report({document:item?{id:item.name,kind:item.kind,dirty:videoIsEdited(session),readOnly:session?.status==='exporting'}:undefined,
   selection:selected?{kind:'one',count:1,type:isTitleClip(selected)?'title':'video-clip',ids:[selected.id]}:{kind:'none',count:0,ids:[]},
   data:{duration:videoTimelineDuration(session),clipCount:session?.clips.length??0},busy:session?.status==='loading'||session?.status==='exporting',
   services:{ready:session?.status==='ready',exporting:session?.status==='exporting'}});
 },[item,session]);
 return <main className="center" aria-label={t('video.title')}><div className="workspace"><section className="code-pane" aria-label={t('video.title')}>
  <FileTabs/>
  {item&&(item.kind==='video'||item.kind==='video-project')?<VideoWorkspace key={item.name} item={item}/>:
   <StudioEmptyState studio="video" icon={<Film/>} onOpen={openVideoDialog} onCreate={()=>createBlankProject('video')}/>}
 </section></div></main>;
}
