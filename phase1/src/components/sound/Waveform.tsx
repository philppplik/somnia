import {useEffect,useRef} from 'react';
interface Props{original:Float32Array|null;processed:Float32Array|null;originalSeconds:number;processedSeconds:number;position:number;label:string;onSeek:(seconds:number)=>void;onKey:(e:React.KeyboardEvent)=>void;duration:number}
/** Min/max columns of both versions on one shared time axis, with a playhead. Colours come from the theme tokens. */
export function Waveform({original,processed,originalSeconds,processedSeconds,position,label,onSeek,onKey,duration}:Props){
 const box=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const span=Math.max(originalSeconds,processedSeconds,0.001);
 useEffect(()=>{
  const el=canvas.current,host=box.current;if(!el||!host)return;
  const draw=()=>{
   const dpr=window.devicePixelRatio||1,w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
   el.width=Math.round(w*dpr);el.height=Math.round(h*dpr);const g=el.getContext('2d');if(!g)return;g.scale(dpr,dpr);
   const css=getComputedStyle(host),accent=css.getPropertyValue('--accent').trim()||'#6d28d9',faint=css.getPropertyValue('--text-tertiary').trim()||'#999',line=css.getPropertyValue('--border-subtle').trim()||'#ddd';
   const mid=h/2;g.clearRect(0,0,w,h);g.fillStyle=line;g.fillRect(0,mid,w,1);
   const paint=(peaks:Float32Array|null,seconds:number,color:string,alpha:number)=>{
    if(!peaks)return;const cols=peaks.length/2,width=w*(seconds/span);g.globalAlpha=alpha;g.fillStyle=color;
    for(let i=0;i<cols;i++){const lo=peaks[2*i],hi=peaks[2*i+1],x=(i/cols)*width;g.fillRect(x,mid-hi*(mid-6),Math.max(1,width/cols),Math.max(1,(hi-lo)*(mid-6)));}
    g.globalAlpha=1;
   };
   paint(original,originalSeconds,faint,0.45);paint(processed,processedSeconds,accent,0.9);
   const x=Math.min(w,(position/span)*w);g.fillStyle=accent;g.fillRect(x-0.5,0,1.5,h);
  };
  draw();const ro=new ResizeObserver(draw);ro.observe(host);return()=>ro.disconnect();
 },[original,processed,originalSeconds,processedSeconds,position,span]);
 return <div ref={box} role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(0,Math.round(duration*100)/100)} aria-valuenow={Math.round(position*100)/100} aria-valuetext={`${position.toFixed(1)} s`} data-testid="sound-waveform"
  className="relative h-full min-h-[160px] w-full cursor-pointer rounded-lg border border-subtle bg-surface outline-none focus-visible:ring-2 focus-visible:ring-accent"
  onKeyDown={onKey} onPointerDown={e=>{const r=e.currentTarget.getBoundingClientRect();onSeek(Math.max(0,((e.clientX-r.left)/r.width)*span));}}>
  <canvas ref={canvas} className="absolute inset-0 size-full"/>
 </div>;
}
