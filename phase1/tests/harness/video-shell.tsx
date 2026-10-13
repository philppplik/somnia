import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/styles/global.css';
import '../../src/styles/bento.css';
import {SourcesPanel,SequencePanel,VideoDocumentSection,VideoSelectionSection,VideoAudioSection,VideoExportSection} from '../../src/components/video/VideoPanels';
import {InspectorPanel,registerInspectorSection} from '../../src/components/shell/InspectorPanel';
import {addMediaFile,addBlankVideoProject,getMedia,setActiveMedia} from '../../src/lib/media';
import {openVideo,addTimelineClip,setVideoEngineFactory,useVideoSession} from '../../src/lib/video/session';
import {registerVideoCommands} from '../../src/lib/video/commands';
import {addTitleClip} from '../../src/lib/video/titleSession';
import {videoShell} from '../../src/lib/studios/video';
import {resolveRailIcon} from '../../src/lib/shell/railIcons';
import '../../src/components/shell/railIconSet';
import type {StudioContext} from '../../src/lib/shell/types';
import {isTitleClip} from '../../src/lib/video/titles';
import {TitlePreview} from '../../src/components/video/TitlePreview';
import {clipRanges,timelineDuration} from '../../src/lib/video/timeline';
// Deterministic probe seam only; the panels and typed commands are production components.
setVideoEngineFactory(()=>({capabilities:async()=>({webmVideo:'vp9',mp4Video:null,opus:true,aac:false}),probe:async()=>({duration:12,video:{width:1920,height:1080,fps:30,codec:'vp9'},audio:{codec:'opus',channels:2,rate:48000}}),export:async()=>{throw Error('Harness does not encode.');},cancelExport(){},dispose(){}}));
const bytes=await fetch('/tests/assets/clip.webm').then(r=>r.arrayBuffer());
const source=await addMediaFile(new Blob([bytes],{type:'video/webm'}),'Coast at sunrise.webm');if('error' in source)throw Error(source.error);
addBlankVideoProject('Travel film');const root=getMedia().active!;await openVideo(getMedia().items.find(i=>i.name===root)!);
await addTimelineClip(root,getMedia().items.find(i=>i.kind==='video')!);
addTitleClip(root,Number.MAX_SAFE_INTEGER,{text:'Chapter One\nA new day',background:'#243448',size:96});setActiveMedia(root);registerVideoCommands();
registerInspectorSection('video.inspector.document',VideoDocumentSection);registerInspectorSection('video.inspector.selection',VideoSelectionSection);registerInspectorSection('video.inspector.audio',VideoAudioSection);registerInspectorSection('video.inspector.export',VideoExportSection);
function Harness(){
 const s=useVideoSession(root)!;const [dark,setDark]=useState(false);const [panel,setPanel]=useState('sequence');
 const selected=s.clips.find(c=>c.id===s.selectedClipId);
 const ctx:StudioContext={studio:'video',selection:selected?{kind:'one',count:1,type:isTitleClip(selected)?'title':'video-clip'}:{kind:'none',count:0},busy:false,services:{ready:s.status==='ready',exporting:s.status==='exporting'}};
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';},[dark]);
 return <div style={{height:'100vh',display:'grid',gridTemplateRows:'54px 1fr 30px',padding:12,gap:8,color:'var(--ink)'}}>
  <header className="flex items-center gap-6 rounded-[25px] bg-panel px-5 text-xs"><strong>Somnia / Video</strong><span>Project　 Edit　 View　 Insert　 Tools　 Help</span><span className="flex-1"/><button data-testid="harness-theme" onClick={()=>setDark(v=>!v)}>{dark?'Light':'Dark'}</button><span>Isolated panel verification</span></header>
  <div style={{display:'grid',gridTemplateColumns:'44px 252px minmax(360px,1fr) 320px 44px',gap:8,minHeight:0}}>
   <nav className="flex flex-col items-center gap-3 rounded-[25px] bg-panel py-4">{videoShell.leftRail!.filter(r=>r.kind==='panel').map(r=>{const Icon=resolveRailIcon(r.icon);return <button key={r.id} aria-label={r.label} onClick={()=>setPanel(r.id)} className={'rounded-lg p-2 '+(panel===r.id?'bg-accent-soft text-accent':'text-ink-3')}><Icon size={18}/></button>;})}</nav>
   <section className="overflow-auto rounded-[25px] bg-panel"><div className="border-b border-subtle px-3 py-3 text-xs font-medium">{panel==='sources'?'Sources':'Sequence'}</div>{panel==='sources'?<SourcesPanel panelId="sources" context={ctx}/>:<SequencePanel panelId="sequence" context={ctx}/>}</section>
   <main className="flex min-h-0 flex-col rounded-[25px] bg-panel p-4"><div className="mb-3 text-xs text-ink-3">Travel film · 1920 × 1080 · 30 fps</div><div className="flex min-h-0 flex-1 items-center justify-center rounded-xl bg-black/90">{selected&&isTitleClip(selected)&&<TitlePreview clip={selected} time={1} aspect={16/9} label="Chapter One"/>}</div><div className="py-3 text-xs text-ink-3">0:00.0 / {timelineDuration(s.clips).toFixed(2)} s</div><div className="flex h-16 gap-2">{clipRanges(s.clips).map(r=><div key={r.clip.id} className="flex-1 rounded-xl bg-accent-soft p-3 text-xs text-accent">{isTitleClip(r.clip)?r.clip.title.text:r.clip.source}<div>{r.start.toFixed(2)} - {r.end.toFixed(2)}</div></div>)}</div></main>
   <section className="overflow-auto rounded-[25px] bg-panel"><InspectorPanel panelId="inspector" context={ctx}/></section>
   <nav className="flex justify-center rounded-[25px] bg-panel py-4">{(()=>{const Icon=resolveRailIcon('SlidersHorizontal');return <Icon size={18}/>;})()}</nav>
  </div><footer className="flex items-center px-4 text-[11px] text-ink-3">Video　·　{ s.clips.length} clips　·　Local sources unchanged</footer>
 </div>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
