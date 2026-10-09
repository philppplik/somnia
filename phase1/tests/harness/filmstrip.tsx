/** Dev-only harness: the REAL VideoTimeline with FilmstripStrip wired in via renderStrip, over real clips. Not shipped. */
import {StrictMode,useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/styles/global.css';
import '../../src/styles/bento.css';
import {VideoTimeline} from '../../src/components/video/VideoTimeline';
import {FilmstripStrip} from '../../src/components/video/FilmstripStrip';
import {FilmstripController} from '../../src/lib/video/filmstrip-controller';
import {FilmstripEngine} from '../../src/lib/video/filmstrip-engine';
import {fullClip,type TimelineClip} from '../../src/lib/video/timeline';
const names=['clip.webm','clip2.webm'];
function App(){
 const controller=useMemo(()=>new FilmstripController(new FilmstripEngine(),{dpr:window.devicePixelRatio||1}),[]);
 const [clips,setClips]=useState<TimelineClip[]>([]);
 const [sel,setSel]=useState<string|null>(null);
 useEffect(()=>{(async()=>{
  const cs:TimelineClip[]=[];
  for(const n of names){
   const bytes=await fetch('/tests/assets/'+n).then(r=>r.arrayBuffer());
   controller.register(n,bytes.slice(0));
   cs.push(fullClip(n,2.008));
  }
  setClips([cs[0],{...cs[1],in_s:0.2,out_s:1.8},{...cs[0],id:'c3',in_s:0.5,out_s:1.5}]);
 })();},[controller]);
 (window as any).__h={controller,setClips,clips,getBatches:()=>controller.batches,size:()=>controller.size};
 return <div style={{width:900,padding:24}} className="bg-surface text-ink">
  <VideoTimeline clips={clips} selectedId={sel} position={1} missing={new Set()} onSeek={()=>{}} onSelect={setSel}
   onTrim={(id,edge,t)=>setClips(cs=>cs.map(c=>c.id!==id?c:edge==='in'?{...c,in_s:Math.max(0,Math.min(t,c.out_s-0.05))}:{...c,out_s:Math.min(2.008,Math.max(t,c.in_s+0.05))}))}
   onMove={()=>{}} label="Timeline" trackHeight={48}
   renderStrip={c=><FilmstripStrip controller={controller} source={c.source} in_s={c.in_s} out_s={c.out_s} name={c.source}/>}/>
 </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
