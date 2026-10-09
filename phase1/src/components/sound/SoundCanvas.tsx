import {AudioWaveform} from '../../lib/icons';
import {Button} from '../ui/button';
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
   <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center" data-testid="sound-start">
    <AudioWaveform size={36} className="text-ink-3"/>
    <div><h1 className="m-0 text-[18px] font-semibold text-ink">{t('sound.start.title')}</h1><p className="mx-auto mt-2 max-w-[420px] text-[13px] text-ink-2">{t('sound.start.body')}</p></div>
    <Button variant="primary" onClick={()=>void openAudioDialog()} data-testid="sound-open">{t('sound.start.open')}</Button>
    <p className="text-[11px] text-ink-3">{t('sound.start.drop')}</p>
   </div>}
 </section></div></main>;
}
