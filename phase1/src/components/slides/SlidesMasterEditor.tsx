import {useMemo,useState} from 'react';
import {Button} from '../ui/button';
import {NumberField} from '../ui/number-field';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {readMaster,readLayoutBoxes,type BoundsBox} from '../../lib/slides/deckPackage';

const PT=12700,FIELDS=[['x','slides.master.x'],['y','slides.master.y'],['w','slides.master.w'],['h','slides.master.h']] as const;
/** Position and size of the slide master placeholders, in points. Each committed field is one command, so one undo step. */
export function SlidesMasterEditor(){
  const s=useSlidesSession(),t=useSlidesPanelText(),info=useMemo(()=>s.working?readMaster(s.working):null,[s.working]),lay=useMemo(()=>s.working?readLayoutBoxes(s.working):null,[s.working]);
  const [pick,setPick]=useState<number|null>(null),[scope,setScope]=useState('master'),[error,setError]=useState('');
  if(!info)return null;
  if(!info.editable)return <p className="px-4 py-2 text-xs text-ink-3">{t('slides.master.readonly',{problem:info.problem})}</p>;
  const layout=scope==='master'?null:lay?.layouts.find(l=>l.part===scope)??null,list=layout?layout.placeholders:info.placeholders;
  const ph=list.find(p=>p.id===pick)??list[0];
  const ready=!s.busy&&!s.presenting;
  const commit=(key:keyof BoundsBox,pt:number)=>{
    const next={...ph!.box,[key]:Math.round(pt*PT)};
    void commandDispatcher.tryRunCommand(layout?'slides.editLayoutPlaceholder':'slides.editMasterPlaceholder',layout?{source:s.source,layoutPart:layout.part,shapeId:ph!.id,expected:ph!.box,next}:{source:s.source,shapeId:ph!.id,expected:ph!.box,next},{origin:'ui'}).then(r=>setError(r.ok?'':r.error.message));
  };
  return <div className="flex flex-col gap-2 px-4 py-2">
    <p className="text-xs text-ink-3">{t('slides.master.summary')}</p>
    {lay?.editable&&<div className="flex flex-wrap gap-1">
      <Button size="compact" variant={!layout?'outline':'ghost'} aria-pressed={!layout} onClick={()=>{setScope('master');setPick(null);setError('');}}>{t('slides.master.title')}</Button>
      {lay.layouts.filter(l=>l.placeholders.length>0).map(l=><Button key={l.part} size="compact" variant={layout?.part===l.part?'outline':'ghost'} aria-pressed={layout?.part===l.part} onClick={()=>{setScope(l.part);setPick(null);setError('');}}>{t('slides.master.layout')}: {l.name}</Button>)}
    </div>}
    {ph&&<><div className="flex flex-wrap gap-1">
      {list.map(p=><Button key={p.id} size="compact" variant={p.id===ph.id?'outline':'ghost'} aria-pressed={p.id===ph.id} onClick={()=>{setPick(p.id);setError('');}}>{p.name||p.type}</Button>)}
    </div>
    <div className="flex flex-wrap gap-2">
      {FIELDS.map(([key,label])=><div key={key} className="w-28"><NumberField label={t(label)} unit="pt" value={Math.round(ph!.box[key]/PT*10)/10} resetKey={`${ph!.id}:${ph!.box[key]}`} min={key==='w'||key==='h'?10:-2000} max={4000} disabled={!ready} parse={d=>{const n=Number(d.trim().replace(',','.'));const lo=key==='w'||key==='h'?10:-2000;return d.trim()!==''&&Number.isFinite(n)&&n>=lo&&n<=4000?{ok:true,value:n}:{ok:false,error:t('slides.master.invalid')};}} constraintError={t('slides.master.invalid')} onCommit={v=>commit(key,v)}/></div>)}
    </div>
    </>}
    {error&&<p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
