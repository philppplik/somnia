import {useMemo,useRef,useState} from 'react';
import {NativeInput} from '../ui/native-controls';
import {MAX_IMAGE_BYTES,encodeBase64} from '../../lib/slides/imageSniff';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {Button} from '../ui/button';
import {NumberField} from '../ui/number-field';
import {Menu,MenuTrigger,MenuContent,MenuItem} from '../ui/menu';
import {TEXT_COLORS,colorKey} from '../../lib/slides/textFormat';
import {MIN_SIZE_PT,MAX_SIZE_PT,ARRANGE_MODES,TRANSITION_KINDS,TRANSITION_DIRS,TRANSITION_SPEEDS,readSlideTransition,boundsEditIssue} from '../../lib/slides/deckPackage';
import {ALIGN_MODES} from '../../lib/slides/shapeGeometry';
import {useValidShape} from './SlidesShapeOverlay';

/** Text box tools: add, remove, and character formatting for every run of the selected text box. */
export function SlidesTextToolbar(){
  const s=useSlidesSession(),t=useSlidesPanelText(),valid=useValidShape();
  const slideId=s.slideIds[s.index],ready=!!s.working&&!s.busy&&!s.presenting&&slideId!==undefined&&!!s.model;
  const shape=valid?.shape,multi=(valid?.more.length??0)>0,box=!multi&&!!shape&&shape.kind==='text'&&shape.runCount>0,f=shape?.fmt;
  const run=(id:string,params:unknown)=>void commandDispatcher.tryRunCommand(id,params,{origin:'ui'});
  const fmt=(patch:Record<string,unknown>)=>run('slides.formatText',{source:s.source,slideId,shapeId:shape!.id,...patch});
  const pic=!multi&&!!shape&&shape.kind==='picture',file=useRef<HTMLInputElement>(null),mode=useRef<'insert'|'replace'>('insert');
  const tr=useMemo(()=>{if(!s.working||slideId===undefined)return null;try{return readSlideTransition(s.working,slideId);}catch{return null;}},[s.working,slideId]);
  const setTr=(patch:Record<string,unknown>)=>run('slides.setTransition',{source:s.source,slideId,...patch});
  const [bad,setBad]=useState(false);
  const pick=(m:'insert'|'replace')=>{mode.current=m;setBad(false);file.current?.click();};
  const onFile=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0];e.target.value='';if(!f)return;
    if(f.size>MAX_IMAGE_BYTES){setBad(true);return;}
    const data=encodeBase64(new Uint8Array(await f.arrayBuffer()));
    const r=mode.current==='replace'&&shape
      ?await commandDispatcher.tryRunCommand('slides.replaceImage',{source:s.source,slideId,shapeId:shape.id,data},{origin:'ui'})
      :await commandDispatcher.tryRunCommand('slides.insertImage',{source:s.source,slideId,name:f.name,data},{origin:'ui'});
    setBad(!r.ok);
  };
  return <div role="toolbar" aria-label={t('slides.textToolbar')} data-slot="slides-text-toolbar" className="flex shrink-0 flex-wrap items-end gap-2 border-b border-subtle px-4 py-2">
    <Button size="compact" variant="outline" disabled={!ready} onClick={()=>run('slides.addTextBox',{source:s.source,slideId,text:t('slides.newTextBoxText')})}>{t('slides.addTextBox')}</Button>
    <Button size="compact" variant={f?.bold?'primary':'outline'} aria-pressed={!!f?.bold} disabled={!ready||!box} onClick={()=>fmt({bold:!f?.bold})}>{t('slides.fmt.bold')}</Button>
    <Button size="compact" variant={f?.italic?'primary':'outline'} aria-pressed={!!f?.italic} disabled={!ready||!box} onClick={()=>fmt({italic:!f?.italic})}>{t('slides.fmt.italic')}</Button>
    <div className="w-24"><NumberField label={t('slides.fmt.size')} value={f?.sizePt!=null&&Number.isInteger(f.sizePt)?f.sizePt:null} mixed={!!shape&&(f?.sizePt==null||!Number.isInteger(f.sizePt))} resetKey={`${valid?.selection.shapeId}:${s.slideIds.join()}`} min={MIN_SIZE_PT} max={MAX_SIZE_PT} disabled={!ready||!box}
      parse={d=>/^\d{1,3}$/.test(d.trim())&&Number(d)>=MIN_SIZE_PT&&Number(d)<=MAX_SIZE_PT?{ok:true,value:Number(d)}:{ok:false,error:t('slides.fmt.sizeInvalid')}} constraintError={t('slides.fmt.sizeInvalid')} onCommit={v=>fmt({sizePt:v})}/></div>
    <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={!ready||!box}>{t('slides.fmt.color')}{colorKey(f?.color??null)?`: ${t(`slides.color.${colorKey(f!.color)}`)}`:''}</Button>}/>
      <MenuContent>{TEXT_COLORS.map(c=><MenuItem key={c.key} onClick={()=>fmt({color:c.hex})}>{t(`slides.color.${c.key}`)}</MenuItem>)}</MenuContent></Menu>
    <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={!ready||!shape||[shape,...(valid?.more??[])].some(x=>!!boundsEditIssue(x))}>{t('slides.align')}</Button>}/>
      <MenuContent>
        {ALIGN_MODES.map(m=><MenuItem key={m} onClick={()=>run('slides.alignSelection',{mode:m,to:'slide'})}>{t(`slides.align.${m}`)}</MenuItem>)}
        {multi&&ALIGN_MODES.map(m=><MenuItem key={`sel-${m}`} onClick={()=>run('slides.alignSelection',{mode:m,to:'selection'})}>{t(`slides.alignSel.${m}`)}</MenuItem>)}
      </MenuContent></Menu>
    <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={!ready||!tr}>{t('slides.transition')}{tr?`: ${t(tr.other&&!tr.editable?'slides.transition.other':`slides.transition.${tr.transition.kind}`)}`:''}</Button>}/>
      <MenuContent>{tr&&!tr.editable?<MenuItem disabled>{t('slides.transition.other')}</MenuItem>:tr&&<>
        {TRANSITION_KINDS.map(k=><MenuItem key={k} onClick={()=>setTr({kind:k,dir:tr.transition.dir,speed:tr.transition.speed})}>{tr.transition.kind===k?'• ':''}{t(`slides.transition.${k}`)}</MenuItem>)}
        {['push','wipe','cover'].includes(tr.transition.kind)&&TRANSITION_DIRS.map(d=><MenuItem key={`d-${d}`} onClick={()=>setTr({kind:tr.transition.kind,dir:d,speed:tr.transition.speed})}>{tr.transition.dir===d?'• ':''}{t(`slides.transition.dir.${d}`)}</MenuItem>)}
        {tr.transition.kind!=='none'&&TRANSITION_SPEEDS.map(v=><MenuItem key={`s-${v}`} onClick={()=>setTr({kind:tr.transition.kind,dir:tr.transition.dir,speed:v})}>{tr.transition.speed===v?'• ':''}{t(`slides.transition.speed.${v}`)}</MenuItem>)}
      </>}</MenuContent></Menu>
    <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={!ready||!shape}>{t('slides.arrange')}</Button>}/>
      <MenuContent>{ARRANGE_MODES.map(m=><MenuItem key={m} onClick={()=>run('slides.arrangeShapes',{mode:m})}>{t(`slides.arrange.${m}`)}</MenuItem>)}</MenuContent></Menu>
    <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={!ready||(valid?.more.length??0)<2||[shape!,...(valid?.more??[])].some(x=>!!boundsEditIssue(x))}>{t('slides.distribute')}</Button>}/>
      <MenuContent>{(['horizontal','vertical'] as const).map(a=><MenuItem key={a} onClick={()=>run('slides.distributeSelection',{axis:a})}>{t(`slides.distribute.${a}`)}</MenuItem>)}</MenuContent></Menu>
    <Button size="compact" variant="outline" disabled={!ready||!shape||multi||(shape.kind!=='text'&&!pic)} onClick={()=>run(pic?'slides.removePicture':'slides.removeTextBox',{source:s.source,slideId,shapeId:shape!.id})}>{t(pic?'slides.removePicture':'slides.removeTextBox')}</Button>
    <Button size="compact" variant="outline" disabled={!ready} title={t('slides.imageHint')} onClick={()=>pick('insert')}>{t('slides.insertImage')}</Button>
    <Button size="compact" variant="outline" disabled={!ready||!pic} onClick={()=>pick('replace')}>{t('slides.replaceImage')}</Button>
    <NativeInput ref={file} type="file" accept="image/png,image/jpeg" className="hidden" tabIndex={-1} aria-label={t('slides.imageTools')} onChange={e=>void onFile(e)}/>
    {bad&&<span role="alert" className="text-xs text-danger">{t('slides.imageRejected')}</span>}
  </div>;
}
