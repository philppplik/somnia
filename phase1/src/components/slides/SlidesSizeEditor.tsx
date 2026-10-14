import {useMemo,useState} from 'react';
import {Button} from '../ui/button';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {readSlideSize,SLIDE_SIZE_PRESETS} from '../../lib/slides/deckPackage';

const EMU_PT=12700,CHOICES=[['16:9','slides.size.wide'],['4:3','slides.size.standard'],['16:10','slides.size.sixteenTen']] as const;
/** Slide size presets. One command, one undo step; content is fitted and centered, fonts stay. */
export function SlidesSizeEditor(){
  const s=useSlidesSession(),t=useSlidesPanelText(),size=useMemo(()=>{if(!s.working)return null;try{return readSlideSize(s.working);}catch{return null;}},[s.working]);
  const [error,setError]=useState('');
  if(!size)return null;
  const ready=!s.busy&&!s.presenting;
  const run=(cx:number,cy:number)=>void commandDispatcher.tryRunCommand('slides.setSlideSize',{source:s.source,cx,cy},{origin:'ui'}).then(r=>setError(r.ok?'':r.error.message));
  return <div className="flex flex-col gap-2 px-4 py-2">
    <p className="text-xs text-ink-3">{t('slides.size.note')}</p>
    <p className="text-xs text-ink-2">{t('slides.size.current',{w:Math.round(size.cx/EMU_PT*10)/10,h:Math.round(size.cy/EMU_PT*10)/10})}</p>
    <div className="flex flex-wrap gap-2">
      {CHOICES.map(([k,label])=>{const p=SLIDE_SIZE_PRESETS[k];return <Button key={k} size="compact" variant="outline" disabled={!ready||(p.cx===size.cx&&p.cy===size.cy)} onClick={()=>run(p.cx,p.cy)}>{t(label)}</Button>;})}
    </div>
    {error&&<p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
