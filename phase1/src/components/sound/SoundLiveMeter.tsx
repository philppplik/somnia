import {useEffect,useState,type RefObject} from 'react';
import {useT} from '../../lib/useT';
import {meterDb,meterFill,meterLevel} from '../../lib/sound/meter';

/** Live stereo-linked peak meter for the rendered mix: taps the playback element through Web Audio while it plays. */
export function SoundLiveMeter({audio}:{audio:RefObject<HTMLAudioElement|null>}){
 const {t}=useT();const [level,setLevel]=useState(0);
 useEffect(()=>{
  const el=audio.current;if(!el)return;
  let ctx:AudioContext|null=null,analyser:AnalyserNode|null=null,raf=0;let buf:Float32Array<ArrayBuffer>=new Float32Array(0);
  const start=()=>{
   try{
    if(!ctx){ctx=new AudioContext();const source=ctx.createMediaElementSource(el);analyser=ctx.createAnalyser();analyser.fftSize=2048;source.connect(analyser);analyser.connect(ctx.destination);buf=new Float32Array(analyser.fftSize);}
   }catch{return;}
   void ctx.resume();cancelAnimationFrame(raf);
   const tick=()=>{analyser!.getFloatTimeDomainData(buf);setLevel(previous=>meterLevel(previous,buf));raf=requestAnimationFrame(tick);};
   raf=requestAnimationFrame(tick);
  };
  const stop=()=>{cancelAnimationFrame(raf);setLevel(0);};
  el.addEventListener('play',start);el.addEventListener('pause',stop);el.addEventListener('ended',stop);
  return()=>{el.removeEventListener('play',start);el.removeEventListener('pause',stop);el.removeEventListener('ended',stop);cancelAnimationFrame(raf);void ctx?.close();};
 },[audio]);
 const db=meterDb(level);
 return <div className="flex items-center gap-2" role="meter" aria-label={t('sound.arrange.liveMeter')} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={db===-Infinity?-60:Math.round(db*10)/10} data-testid="sound-live-meter">
  <span className="text-[10px] text-ink-3">{t('sound.arrange.liveMeter')}</span>
  <span className="h-2 w-28 overflow-hidden rounded bg-canvas"><span className="block h-full bg-accent" style={{width:`${meterFill(level)*100}%`}}/></span>
  <span className="w-14 text-[10px] tabular-nums text-ink-3">{db===-Infinity?'-∞':db.toFixed(1)} dB</span>
 </div>;
}
