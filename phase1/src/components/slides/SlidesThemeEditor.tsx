import {useEffect,useMemo,useState} from 'react';
import {NativeInput} from '../ui/native-controls';
import {Button} from '../ui/button';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {readTheme,themeFontIssue,THEME_SLOTS,MAX_FONT_NAME,type ThemeSlot} from '../../lib/slides/deckPackage';

const HEX=/^[0-9A-F]{6}$/;
/** Theme colors and fonts of the deck. Every Apply is one command, so one undo step. */
export function SlidesThemeEditor(){
  const s=useSlidesSession(),t=useSlidesPanelText(),info=useMemo(()=>s.working?readTheme(s.working):null,[s.working]);
  const [colors,setColors]=useState<Record<string,string>>({}),[fonts,setFonts]=useState({major:'',minor:''}),[error,setError]=useState('');
  useEffect(()=>{if(info?.editable){setColors({...info.colors});setFonts({major:info.major,minor:info.minor});}},[info]);
  if(!info)return null;
  if(!info.editable)return <p className="px-4 py-2 text-xs text-ink-3">{t('slides.theme.readonly',{problem:info.problem})}</p>;
  const ready=!s.busy&&!s.presenting;
  const run=(edit:Record<string,unknown>)=>void commandDispatcher.tryRunCommand('slides.editTheme',{source:s.source,edit},{origin:'ui'}).then(r=>setError(r.ok?'':r.error.message));
  const hex=(slot:ThemeSlot)=>(colors[slot]??'').toUpperCase().replace(/^#/,'');
  return <div className="flex flex-col gap-2 px-4 py-2">
    <p className="text-xs text-ink-3">{t('slides.theme.summary')}</p>
    <div className="flex flex-wrap gap-2">
      {THEME_SLOTS.map(slot=><div key={slot} className="flex items-center gap-1">
        <NativeInput aria-label={slot} maxLength={7} className="w-24" value={colors[slot]??''} onChange={e=>setColors({...colors,[slot]:e.target.value})}/>
        <Button size="compact" variant="outline" disabled={!ready||!HEX.test(hex(slot))||hex(slot)===info.colors[slot]} onClick={()=>run({kind:'color',slot,color:hex(slot)})}>{t('slides.theme.apply')}</Button>
      </div>)}
    </div>
    <div className="flex flex-wrap gap-2">
      {(['major','minor'] as const).map(role=><div key={role} className="flex items-center gap-1">
        <NativeInput aria-label={t(role==='major'?'slides.theme.major':'slides.theme.minor')} maxLength={MAX_FONT_NAME} className="w-48" value={fonts[role]} onChange={e=>setFonts({...fonts,[role]:e.target.value})}/>
        <Button size="compact" variant="outline" disabled={!ready||!!themeFontIssue(fonts[role])||fonts[role]===info[role]} onClick={()=>run({kind:'font',role,name:fonts[role]})}>{t('slides.theme.apply')}</Button>
      </div>)}
    </div>
    {error&&<p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
