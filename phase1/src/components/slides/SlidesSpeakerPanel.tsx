import {useEffect,useMemo,useRef,useState} from 'react';
import {Button} from '../ui/button';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {readSlideNotes} from '../../lib/slides/deckPackage';
import {newRehearsal,rehearsalStep,rehearsalTimes,rehearsalClock} from '../../lib/slides/rehearsal';

const now=()=>performance.now();
/** Notes are read from the open deck on demand; the timer is wall-clock free and never moves slides. */
export function useSpeakerTimer(index:number){
  const state=useRef(rehearsalStep(newRehearsal(index),'start',now())),[,paint]=useState(0);
  const first=useRef(true);
  useEffect(()=>{if(first.current){first.current=false;return;}state.current=rehearsalStep(state.current,'slide',now(),index);paint(x=>x+1);},[index]);
  useEffect(()=>{const id=setInterval(()=>{if(state.current.running)paint(x=>x+1);},500);return()=>clearInterval(id);},[]);
  const times=rehearsalTimes(state.current,now());
  return {running:state.current.running,slideMs:times[index]??0,totalMs:Object.values(times).reduce((a,b)=>a+b,0),
    toggle:()=>{state.current=rehearsalStep(state.current,state.current.running?'pause':'start',now());paint(x=>x+1);},
    reset:()=>{state.current=rehearsalStep(state.current,'reset',now(),index);paint(x=>x+1);}};
}
export function SlidesSpeakerPanel({bytes,slideId,next,timer}:{bytes:Uint8Array|null;slideId:number|undefined;next:string|undefined;timer:ReturnType<typeof useSpeakerTimer>}){
  const t=useSlidesPanelText();
  const notes=useMemo(()=>{if(!bytes||slideId===undefined)return {lines:[] as string[],failed:false};try{return {lines:readSlideNotes(bytes,slideId),failed:false};}catch{return {lines:[] as string[],failed:true};}},[bytes,slideId]);
  return <aside aria-label={t('slides.speaker.title')} data-slot="slides-speaker-panel" onClick={e=>e.stopPropagation()} className="absolute bottom-24 right-4 top-4 flex w-80 max-w-[40vw] flex-col gap-3 overflow-hidden rounded-lg bg-black/85 p-3 text-sm text-white">
    <div className="flex items-baseline justify-between gap-2"><strong>{t('slides.speaker.title')}</strong><span className="text-xs opacity-70">{t('slides.speaker.shared')}</span></div>
    <div className="flex flex-wrap items-center gap-3 tabular-nums" role="timer" aria-label={t('slides.speaker.total')}>
      <span><span className="block text-xs opacity-70">{t('slides.speaker.total')}</span><span className="text-lg">{rehearsalClock(timer.totalMs)}</span></span>
      <span><span className="block text-xs opacity-70">{t('slides.speaker.slide')}</span><span className="text-lg">{rehearsalClock(timer.slideMs)}</span></span>
      <span className="flex w-full flex-wrap gap-2"><Button size="compact" variant="outline" onClick={timer.toggle}>{timer.running?t('slides.rehearsal.pause'):t('slides.rehearsal.start')}</Button><Button size="compact" variant="outline" onClick={timer.reset}>{t('slides.rehearsal.reset')}</Button></span>
    </div>
    <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap" tabIndex={0}>
      {notes.failed?<p role="alert">{t('slides.speaker.error')}</p>:notes.lines.length?notes.lines.map((l,i)=><p key={i} className="mb-2">{l}</p>):<p className="opacity-70">{t('slides.speaker.none')}</p>}
    </div>
    {next&&<figure className="m-0"><figcaption className="mb-1 text-xs opacity-70">{t('slides.speaker.next')}</figcaption><img src={next} alt="" draggable={false} className="w-full rounded"/></figure>}
  </aside>;
}
