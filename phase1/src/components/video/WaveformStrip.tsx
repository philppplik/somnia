import {useEffect,useRef,useState} from 'react';
import type {FilmstripController} from '../../lib/video/filmstrip-controller';
import {slicePeaks,slicePeaksScaled} from '../../lib/video/waveform';
interface Props{controller:FilmstripController;source:string;in_s:number;out_s:number;gain:number;className?:string;/** Per-source-time display scale (gain · fades · duck); overrides the flat `gain` when set. */scaleAt?:(sourceTime:number)=>number}
/**
 * Waveform layer for one timeline clip: min/max columns of the clip's source range over the filmstrip.
 * Renders nothing until the peaks decode lands; a source without audio stays strip-only.
 */
export function WaveformStrip({controller,source,in_s,out_s,gain,className,scaleAt}:Props){
 const ref=useRef<HTMLCanvasElement>(null);
 const [tick,setTick]=useState(0);
 useEffect(()=>{
  let raf=0;
  const off=controller.subscribe(()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;setTick(n=>n+1);});});
  return()=>{off();if(raf)cancelAnimationFrame(raf);};
 },[controller]);
 const peaks=controller.peaksFor(source);
 useEffect(()=>{
  const canvas=ref.current;if(!canvas||!peaks)return;
  const parent=canvas.parentElement;if(!parent)return;
  const w=Math.round(parent.clientWidth),h=Math.round(parent.clientHeight);
  if(w<1||h<1)return;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const W=Math.round(w*dpr),H=Math.round(h*dpr);
  if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,W,H);
  const info=controller.info(source);if(!info)return;
  const cols=scaleAt?slicePeaksScaled(peaks,info.duration,in_s,out_s,W,scaleAt):slicePeaks(peaks,info.duration,in_s,out_s,W,gain);
  ctx.fillStyle='rgba(255,255,255,0.55)';
  const mid=H/2;
  for(let x=0;x<W;x++){
   const lo=cols[x*2],hi=cols[x*2+1];
   const y0=mid+lo*mid,y1=mid+hi*mid;
   ctx.fillRect(x,y0,1,Math.max(dpr,y1-y0));
  }
 },[controller,source,in_s,out_s,gain,scaleAt,peaks,tick]);
 if(!peaks)return null;
 return <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${className??''}`} aria-hidden="true" data-testid="video-waveform"/>;
}
