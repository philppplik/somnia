import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {Button} from '../ui/button';
import {NumberField} from '../ui/number-field';
import {Menu,MenuTrigger,MenuContent,MenuItem} from '../ui/menu';
import {TEXT_COLORS,colorKey} from '../../lib/slides/textFormat';
import {MIN_SIZE_PT,MAX_SIZE_PT} from '../../lib/slides/deckPackage';
import {useValidShape} from './SlidesShapeOverlay';

/** Text box tools: add, remove, and character formatting for every run of the selected text box. */
export function SlidesTextToolbar(){
  const s=useSlidesSession(),t=useSlidesPanelText(),valid=useValidShape();
  const slideId=s.slideIds[s.index],ready=!!s.working&&!s.busy&&!s.presenting&&slideId!==undefined&&!!s.model;
  const shape=valid?.shape,box=!!shape&&shape.kind==='text'&&shape.runCount>0,f=shape?.fmt;
  const run=(id:string,params:unknown)=>void commandDispatcher.tryRunCommand(id,params,{origin:'ui'});
  const fmt=(patch:Record<string,unknown>)=>run('slides.formatText',{source:s.source,slideId,shapeId:shape!.id,...patch});
  return <div role="toolbar" aria-label={t('slides.textToolbar')} data-slot="slides-text-toolbar" className="flex shrink-0 flex-wrap items-end gap-2 border-b border-subtle px-4 py-2">
    <Button size="compact" variant="outline" disabled={!ready} onClick={()=>run('slides.addTextBox',{source:s.source,slideId,text:t('slides.newTextBoxText')})}>{t('slides.addTextBox')}</Button>
    <Button size="compact" variant={f?.bold?'primary':'outline'} aria-pressed={!!f?.bold} disabled={!ready||!box} onClick={()=>fmt({bold:!f?.bold})}>{t('slides.fmt.bold')}</Button>
    <Button size="compact" variant={f?.italic?'primary':'outline'} aria-pressed={!!f?.italic} disabled={!ready||!box} onClick={()=>fmt({italic:!f?.italic})}>{t('slides.fmt.italic')}</Button>
    <div className="w-24"><NumberField label={t('slides.fmt.size')} value={f?.sizePt!=null&&Number.isInteger(f.sizePt)?f.sizePt:null} mixed={!!shape&&(f?.sizePt==null||!Number.isInteger(f.sizePt))} resetKey={`${valid?.selection.shapeId}:${s.slideIds.join()}`} min={MIN_SIZE_PT} max={MAX_SIZE_PT} disabled={!ready||!box}
      parse={d=>/^\d{1,3}$/.test(d.trim())&&Number(d)>=MIN_SIZE_PT&&Number(d)<=MAX_SIZE_PT?{ok:true,value:Number(d)}:{ok:false,error:t('slides.fmt.sizeInvalid')}} constraintError={t('slides.fmt.sizeInvalid')} onCommit={v=>fmt({sizePt:v})}/></div>
    <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={!ready||!box}>{t('slides.fmt.color')}{colorKey(f?.color??null)?`: ${t(`slides.color.${colorKey(f!.color)}`)}`:''}</Button>}/>
      <MenuContent>{TEXT_COLORS.map(c=><MenuItem key={c.key} onClick={()=>fmt({color:c.hex})}>{t(`slides.color.${c.key}`)}</MenuItem>)}</MenuContent></Menu>
    <Button size="compact" variant="outline" disabled={!ready||!shape||shape.kind!=='text'} onClick={()=>run('slides.removeTextBox',{source:s.source,slideId,shapeId:shape!.id})}>{t('slides.removeTextBox')}</Button>
  </div>;
}
