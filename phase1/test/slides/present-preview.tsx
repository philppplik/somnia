import {createRoot} from 'react-dom/client';
import '../../src/styles/global.css';
import '../../src/styles/bento.css';
import {useSlidesSession,ensureSlides,showSlide} from '../../src/lib/slides/session';
import {SlidesClient} from '../../src/lib/slides/client';
import {addMediaFile} from '../../src/lib/media';
import {registerSlidesCommands} from '../../src/lib/slides/commands';
import {SlidesPresentView} from '../../src/components/slides/SlidesPresentView';
import {useSlidesPanelText} from '../../src/lib/slides/panelI18n';
import {HeroActionSlot} from '../../src/components/shell/HeroActionSlot';
import {patchState} from '../../src/store/appStore';
import '../../src/components/shell/railIconSet';
import {attachKeyboardShortcuts} from '../../src/lib/commands';
import {readRuns} from '../../src/lib/slides/editCopy';
import {diagnosePptx} from '../../src/lib/slides/diagnostics';
// Test-only renderer double. The production session, command, image cache, fullscreen and view are real.
window.Worker=class {onmessage=null;onerror=null;postMessage(){}terminate(){}} as unknown as typeof Worker;
const renders:{index:number;scale:number}[]=[];
Object.assign(window,{presentTest:{renders}});
Object.assign(SlidesClient.prototype,{
 open:async()=>({slides:3,widthPt:720,heightPt:405}),runs:async(bytes:Uint8Array)=>readRuns(bytes),diagnostics:async(bytes:Uint8Array)=>diagnosePptx(bytes),read:async(index:number)=>({index,texts:[`Slide ${index+1}`]}),memory:async()=>({wasmBytes:2000000}),
 render:async(index:number,scale:number)=>{renders.push({index,scale});const c=document.createElement('canvas');c.width=Math.ceil(720*scale);c.height=Math.ceil(405*scale);const ctx=c.getContext('2d')!;ctx.scale(scale,scale);ctx.fillStyle=['#f2f0ff','#e8f8f2','#fef0df'][index];ctx.fillRect(0,0,720,405);ctx.fillStyle='#6453ce';ctx.fillRect(42,54,6,96);ctx.fillStyle='#242038';ctx.font='bold 38px sans-serif';ctx.fillText(['Present your next idea','A clear next step','Thank you'][index],70,100);ctx.font='18px sans-serif';ctx.fillStyle='#656078';ctx.fillText('Somnia Slides · Static presentation preview',70,142);ctx.font='16px sans-serif';ctx.fillText(`0${index+1} / 03`,70,350);return new Uint8Array(await(await new Promise<Blob>(r=>c.toBlob(b=>r(b!)))).arrayBuffer());}
});
registerSlidesCommands();attachKeyboardShortcuts();patchState({activeStudio:'slides'});
function Preview(){const s=useSlidesSession(),t=useSlidesPanelText();return <div style={{minHeight:'100vh',background:'var(--bg-shell)',color:'var(--ink)',padding:24}}><h1 style={{fontSize:24,marginBottom:16}}>Somnia / Slides</h1><p style={{marginBottom:16}}>Test harness: renderer double, real presentation session and commands.</p><div style={{display:'flex',gap:12,alignItems:'center'}}><HeroActionSlot/><button className="ml-3 rounded-lg border px-4 py-2" disabled={s.busy} onClick={()=>void showSlide(1)}>Select slide 2</button></div><p className="my-6">{t('slides.present.counter',{number:s.index+1,count:s.summary?.slides??0})}</p>{s.image&&<img alt="Editor preview" src={s.image} style={{maxWidth:'75vw',maxHeight:'65vh',borderRadius:16}}/>}{s.presenting&&<SlidesPresentView/>}</div>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
const bytes=await(await fetch('/slides-engine/fixtures/independent.pptx')).arrayBuffer();
await addMediaFile(new File([bytes],'present-test.pptx'),'present-test.pptx');await ensureSlides('present-test.pptx');
