import {useEffect,useState} from 'react';
import {SoundArrange} from './SoundArrange';
import {Button} from '../ui/button';
import {registerSoundCommands} from '../../lib/sound/commands';
import {AudioWaveform} from '../../lib/icons';
import {StudioEmptyState} from '../studios/StudioEmptyState';
import {createBlankProject} from '../../lib/studios/blank';
import {FileTabs} from '../FileTabs';
import {useT} from '../../lib/useT';
import {openAudioDialog} from '../../lib/sound/open';
import {useMedia} from '../../lib/media';
import {SoundExportReview} from './SoundExportReview';
import {SoundWorkspace} from './SoundWorkspace';
/** Canvas of the Sound Studio: the opened audio file, or a start screen. */
export function SoundCanvas(){
 useEffect(()=>registerSoundCommands(),[]);
 const {t}=useT();const [arrange,setArrange]=useState(false);const media=useMedia();const item=media.items.find(i=>i.name===media.active);
 return <main className="center" aria-label={t('sound.title')}><div className="workspace"><section className="code-pane" aria-label={t('sound.title')}>
  <div className="flex gap-1 border-b border-subtle p-2"><Button size="compact" aria-pressed={!arrange} onClick={()=>setArrange(false)}>{t('sound.arrange.clipEditor')}</Button><Button size="compact" aria-pressed={arrange} onClick={()=>setArrange(true)}>{t('sound.arrange.title')}</Button></div>
  {arrange?<SoundArrange/>:<><FileTabs/><SoundExportReview/>
  {item?.kind==='audio'?<SoundWorkspace key={item.name} item={item}/>:
   <StudioEmptyState studio="sound" icon={<AudioWaveform/>} onOpen={openAudioDialog} onCreate={()=>createBlankProject('sound')}/>}</>}
 </section></div></main>;
}
