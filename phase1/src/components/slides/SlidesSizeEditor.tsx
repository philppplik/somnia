import {useMemo,useState} from 'react';
import {Button} from '../ui/button';
import {NumberField} from '../ui/number-field';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {readSlideSize,SLIDE_SIZE_PRESETS,MIN_SLIDE_EMU,MAX_SLIDE_EMU} from '../../lib/slides/deckPackage';

const EMU_PT=12700,CHOICES=[['16:9','slides.size.wide'],['4:3','slides.size.standard'],['16:10','slides.size.sixteenTen']] as const;
/** Slide size presets. One command, one undo step; content is fitted and centered, fonts stay. */
export function SlidesSizeEditor(){
  const s=useSlidesSession(),t=useSlidesPanelText(),size=useMemo(()=>{if(!s.working)return null;try{return readSlideSize(s.working);}catch{return null;}},[s.working]);
  const [error,setError]=useState(''),[draft,setDraft]=useState<{w:number|null;h:number|null}>({w:null,h:null});
  if(!size)return null;
  const MIN=MIN_SLIDE_EMU/EMU_PT,MAX=MAX_SLIDE_EMU/EMU_PT,w=draft.w??Math.round(size.cx/EMU_PT*10)/10,h=draft.h??Math.round(size.cy/EMU_PT*10)/10;
  const parse=(d:string)=>{const n=Number(d.trim().replace(',','.'));return d.trim()!==''&&Number.isFinite(n)&&n>=MIN&&n<=MAX?{ok:true as const,value:n}:{ok:false as const,error:t('slides.size.invalid')};};
  const cx=Math.round(w*EMU_PT),cy=Math.round(h*EMU_PT),valid=cx>=MIN_SLIDE_EMU&&cy>=MIN_SLIDE_EMU&&cx<=MAX_SLIDE_EMU&&cy<=MAX_SLIDE_EMU;
  const ready=!s.busy&&!s.presenting;
  const run=(cx:number,cy:number)=>void commandDispatcher.tryRunCommand('slides.setSlideSize',{source:s.source,cx,cy},{origin:'ui'}).then(r=>setError(r.ok?'':r.error.message));
  return <div className="flex flex-col gap-2 px-4 py-2">
    <p className="text-xs text-ink-3">{t('slides.size.note')}</p>
    <p className="text-xs text-ink-2">{t('slides.size.current',{w:Math.round(size.cx/EMU_PT*10)/10,h:Math.round(size.cy/EMU_PT*10)/10})}</p>
    <div className="flex flex-wrap gap-2">
      {CHOICES.map(([k,label])=>{const p=SLIDE_SIZE_PRESETS[k];return <Button key={k} size="compact" variant="outline" disabled={!ready||(p.cx===size.cx&&p.cy===size.cy)} onClick={()=>run(p.cx,p.cy)}>{t(label)}</Button>;})}
    </div>
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-28"><NumberField label={t('slides.size.width')} unit="pt" value={w} resetKey={`w:${size.cx}`} min={MIN} max={MAX} parse={parse} constraintError={t('slides.size.invalid')} disabled={!ready} onCommit={v=>setDraft(d=>({...d,w:v}))}/></div>
      <div className="w-28"><NumberField label={t('slides.size.height')} unit="pt" value={h} resetKey={`h:${size.cy}`} min={MIN} max={MAX} parse={parse} constraintError={t('slides.size.invalid')} disabled={!ready} onCommit={v=>setDraft(d=>({...d,h:v}))}/></div>
      <Button size="compact" variant="outline" disabled={!ready||!valid||(cx===size.cx&&cy===size.cy)} onClick={()=>{run(cx,cy);setDraft({w:null,h:null});}}>{t('slides.size.custom')}</Button>
    </div>
    {error&&<p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
