import {SlidesAltTextField} from './SlidesAltTextField';
import {useMemo,useRef,useState} from 'react';
import {NativeInput} from '../ui/native-controls';
import {MAX_IMAGE_BYTES,encodeBase64} from '../../lib/slides/imageSniff';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {Button} from '../ui/button';
import {NumberField} from '../ui/number-field';
import {Menu,MenuTrigger,MenuContent,MenuItem} from '../ui/menu';
import {TEXT_COLORS,GRADIENT_PRESETS,OPACITY_STEPS,LINE_WIDTHS,colorKey} from '../../lib/slides/textFormat';
import {MIN_SIZE_PT,MAX_SIZE_PT,ARRANGE_MODES,TRANSITION_KINDS,TRANSITION_DIRS,TRANSITION_SPEEDS,LINE_DASHES,readSlideTransition,readShapeStyle,readParagraphFormat,PARA_ALIGNS,PARA_BULLETS,boundsEditIssue} from '../../lib/slides/deckPackage';
import {ALIGN_MODES} from '../../lib/slides/shapeGeometry';
import {useValidShape} from './SlidesShapeOverlay';

const TABLE_PRESETS=[[2,2],[3,3],[4,3],[5,4],[6,5]] as const;

/** Text box tools: add, remove, and character formatting for every run of the selected text box. */
export function SlidesTextToolbar(){
  const s=useSlidesSession(),t=useSlidesPanelText(),valid=useValidShape();
  const slideId=s.slideIds[s.index],ready=!!s.working&&!s.busy&&!s.presenting&&slideId!==undefined&&!!s.model;
  const shape=valid?.shape,multi=(valid?.more.length??0)>0,box=!multi&&!!shape&&shape.kind==='text'&&shape.runCount>0,f=shape?.fmt;
  const run=(id:string,params:unknown)=>void commandDispatcher.tryRunCommand(id,params,{origin:'ui'});
  const fmt=(patch:Record<string,unknown>)=>run('slides.formatText',{source:s.source,slideId,shapeId:shape!.id,...patch});
  const pf=useMemo(()=>{if(!box||!s.working||slideId===undefined||!shape)return null;try{return readParagraphFormat(s.working,slideId,shape.id);}catch{return null;}},[box,s.working,slideId,shape]);
  const para=(patch:Record<string,unknown>)=>run('slides.formatParagraph',{source:s.source,slideId,shapeId:shape!.id,...patch});
  const pic=!multi&&!!shape&&shape.kind==='picture',file=useRef<HTMLInputElement>(null),mode=useRef<'insert'|'replace'>('insert');
  const tr=useMemo(()=>{if(!s.working||slideId===undefined)return null;try{return readSlideTransition(s.working,slideId);}catch{return null;}},[s.working,slideId]);
  const sel=valid?[valid.shape,...valid.more]:[],styleOk=ready&&sel.length>0&&sel.every(x=>!x.parentId&&(x.kind==='text'||x.kind==='picture'));
  const fillOk=styleOk&&sel.every(x=>x.kind==='text');
  const st=useMemo(()=>{if(!s.working||slideId===undefined||!valid)return null;try{return readShapeStyle(s.working,slideId,valid.shape.id);}catch{return null;}},[s.working,slideId,valid]);
  const style=(patch:Record<string,unknown>)=>run('slides.styleShapes',patch);
  const fillAlpha=st&&(st.fill.kind==='solid'||st.fill.kind==='gradient')?st.fill.alpha??100:100;
  const lineNow=st?.line.kind==='solid'?st.line:null;
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
    <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={!ready||!box}>{t('slides.para')}</Button>}/>
      <MenuContent>
        {PARA_ALIGNS.map(a=><MenuItem key={a} onClick={()=>para({align:a})}>{pf?.align===a?'• ':''}{t(`slides.para.align.${a}`)}</MenuItem>)}
        {PARA_BULLETS.map(b=><MenuItem key={b} onClick={()=>para({bullet:b})}>{pf?.bullet===b?'• ':''}{t(`slides.para.bullet.${b}`)}</MenuItem>)}
      </MenuContent></Menu>
    <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={!ready||!box}>{t('slides.fmt.color')}{colorKey(f?.color??null)?`: ${t(`slides.color.${colorKey(f!.color)}`)}`:''}</Button>}/>
      <MenuContent>{TEXT_COLORS.map(c=><MenuItem key={c.key} onClick={()=>fmt({color:c.hex})}>{t(`slides.color.${c.key}`)}</MenuItem>)}</MenuContent></Menu>
    <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={!fillOk||!st}>{t('slides.style.fill')}</Button>}/>
      <MenuContent>{st&&!st.editable?<MenuItem disabled>{t('slides.style.uneditable')}</MenuItem>:<>
        <MenuItem onClick={()=>style({fill:{kind:'none'}})}>{st?.fill.kind==='none'?'• ':''}{t('slides.style.fillNone')}</MenuItem>
        {TEXT_COLORS.map(c=><MenuItem key={c.key} onClick={()=>style({fill:{kind:'solid',color:c.hex,alpha:fillAlpha}})}>{st?.fill.kind==='solid'&&st.fill.color===c.hex?'• ':''}{t(`slides.color.${c.key}`)}</MenuItem>)}
        {GRADIENT_PRESETS.map(g=><MenuItem key={g.key} onClick={()=>style({fill:{kind:'gradient',from:g.from,to:g.to,angle:g.angle,alpha:fillAlpha}})}>{t(`slides.style.gradient.${g.key}`)}</MenuItem>)}
        {(st?.fill.kind==='solid'||st?.fill.kind==='gradient')&&OPACITY_STEPS.map(o=><MenuItem key={`o-${o}`} onClick={()=>style({fill:st.fill.kind==='solid'?{kind:'solid',color:st.fill.color,alpha:o}:{kind:'gradient',from:st.fill.color,to:st.fill.to,angle:st.fill.angle??90,alpha:o}})}>{fillAlpha===o?'• ':''}{t('slides.style.opacity')} {o}%</MenuItem>)}
      </>}</MenuContent></Menu>
    <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={!styleOk||!st}>{t('slides.style.outline')}</Button>}/>
      <MenuContent>{st&&!st.editable?<MenuItem disabled>{t('slides.style.uneditable')}</MenuItem>:<>
        <MenuItem onClick={()=>style({line:{kind:'none'}})}>{st?.line.kind==='none'?'• ':''}{t('slides.style.outlineNone')}</MenuItem>
        {TEXT_COLORS.map(c=><MenuItem key={c.key} onClick={()=>style({line:{kind:'solid',color:c.hex,widthPt:lineNow?.widthPt??1,dash:lineNow?.dash??'solid'}})}>{lineNow?.color===c.hex?'• ':''}{t(`slides.color.${c.key}`)}</MenuItem>)}
        {lineNow&&LINE_WIDTHS.map(w=><MenuItem key={`w-${w}`} onClick={()=>style({line:{kind:'solid',color:lineNow.color,widthPt:w,dash:lineNow.dash??'solid'}})}>{lineNow.widthPt===w?'• ':''}{w} pt</MenuItem>)}
        {lineNow&&LINE_DASHES.map(d=><MenuItem key={`d-${d}`} onClick={()=>style({line:{kind:'solid',color:lineNow.color,widthPt:lineNow.widthPt??1,dash:d}})}>{(lineNow.dash??'solid')===d?'• ':''}{t(`slides.style.dash.${d}`)}</MenuItem>)}
      </>}</MenuContent></Menu>
    <Button size="compact" variant={st?.shadow==='outer'?'primary':'outline'} aria-pressed={st?.shadow==='outer'} disabled={!styleOk||!st||!st.editable} onClick={()=>style({shadow:st?.shadow!=='outer'})}>{t('slides.style.shadow')}</Button>
    <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={!ready}>{t('slides.table.insert')}</Button>}/>
      <MenuContent>{TABLE_PRESETS.map(([r,c])=><MenuItem key={`${r}x${c}`} onClick={()=>run('slides.insertTable',{source:s.source,slideId,rows:r,cols:c})}>{`${r} × ${c}`}</MenuItem>)}</MenuContent></Menu>
    <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={!ready||!shape||[shape,...(valid?.more??[])].some(x=>!!boundsEditIssue(x))}>{t('slides.align')}</Button>}/>
      <MenuContent>
        {ALIGN_MODES.map(m=><MenuItem key={m} onClick={()=>run('slides.alignSelection',{mode:m,to:'slide'})}>{t(`slides.align.${m}`)}</MenuItem>)}
        {multi&&ALIGN_MODES.map(m=><MenuItem key={`sel-${m}`} onClick={()=>run('slides.alignSelection',{mode:m,to:'selection'})}>{t(`slides.alignSel.${m}`)}</MenuItem>)}
      </MenuContent></Menu>
    <Button size="compact" variant="outline" disabled={!ready||(valid?.more.length??0)<1} onClick={()=>run('slides.groupShapes',{})}>{t('slides.group')}</Button>
    <Button size="compact" variant="outline" disabled={!ready||multi||shape?.kind!=='group'} onClick={()=>run('slides.ungroupShape',{})}>{t('slides.ungroup')}</Button>
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
    {!multi&&shape&&shape.parentId===null&&slideId!==undefined&&<SlidesAltTextField slideId={slideId} shapeId={shape.id} disabled={!ready}/>}
    <NativeInput ref={file} type="file" accept="image/png,image/jpeg" className="hidden" tabIndex={-1} aria-label={t('slides.imageTools')} onChange={e=>void onFile(e)}/>
    {bad&&<span role="alert" className="text-xs text-danger">{t('slides.imageRejected')}</span>}
  </div>;
}
