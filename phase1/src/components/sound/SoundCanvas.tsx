import {AudioWaveform} from '../../lib/icons';
import {StudioEmptyState} from '../studios/StudioEmptyState';
import {createBlankProject} from '../../lib/studios/blank';
import {FileTabs} from '../FileTabs';
import {useT} from '../../lib/useT';
import {openAudioDialog} from '../../lib/sound/open';
import {useMedia} from '../../lib/media';
import {SoundWorkspace} from './SoundWorkspace';
/** Canvas of the Sound Studio: the opened audio file, or a start screen. */
export function SoundCanvas(){
 const {t}=useT();const media=useMedia();const item=media.items.find(i=>i.name===media.active);
 return <main className="center" aria-label={t('sound.title')}><div className="workspace"><section className="code-pane" aria-label={t('sound.title')}>
  <FileTabs/>
  {item?.kind==='audio'?<SoundWorkspace key={item.name} item={item}/>:
   <StudioEmptyState studio="sound" icon={<AudioWaveform/>} onOpen={openAudioDialog} onCreate={()=>createBlankProject('sound')}/>}
 </section></div></main>;
}
