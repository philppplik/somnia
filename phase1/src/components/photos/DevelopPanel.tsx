import {useEffect,useRef,useState} from 'react';
import {Button} from '../ui/button';
import {useRasterEditor} from '../RasterEditor';
import {PhotosEngine,type PhotosResponse} from '../../lib/photos/engine';
import {neutralDevelop,photosEngines,type DevelopSettings} from '../../lib/photos/registry';
import {defaultImageHost,editedName} from '../../lib/imageEditorHost';
import {getMedia,registerMediaCloseGuard} from '../../lib/media';
// Session-only state survives inspector switches. Source URL binds state to exact original bytes.
interface Session {now:DevelopSettings;past:DevelopSettings[];future:DevelopSettings[];saved:string}
const sessions=new Map<string,Session>();
const signature=(s:DevelopSettings)=>JSON.stringify(s);
registerMediaCloseGuard(name=>{const url=getMedia().items.find(i=>i.name===name)?.url;const s=url?sessions.get(url):null;if(!s||signature(s.now)===s.saved)return true;if(!window.confirm('Discard session-only Develop edits? Export a copy to keep the developed image.'))return false;sessions.delete(url!);return true;});
if(typeof window!=='undefined')window.addEventListener('beforeunload',e=>{if([...sessions.values()].some(s=>signature(s.now)!==s.saved)){e.preventDefault();e.returnValue='';}});
function session(url:string){let s=sessions.get(url);if(!s){s={now:{...neutralDevelop},past:[],future:[],saved:signature(neutralDevelop)};sessions.set(url,s);}return s;}
function draw(canvas:HTMLCanvasElement|null,r:PhotosResponse){if(!canvas||!r.bytes||!r.width||!r.height)return;canvas.width=r.width;canvas.height=r.height;canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.bytes),r.width,r.height),0,0);}
export function DevelopPanel(){
 const c=useRasterEditor(),url=c.source?.url??'',name=c.name??'photo';const state=session(url);
 const [,refresh]=useState(0),[enabled,setEnabled]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[size,setSize]=useState('');
 const engine=useRef<PhotosEngine|null>(null),before=useRef<HTMLCanvasElement>(null),after=useRef<HTMLCanvasElement>(null),generation=useRef(0);
 const now=state.now;
 useEffect(()=>{setReady(false);setError('');setSize('');if(!enabled||!url)return;const e=new PhotosEngine();engine.current=e;let alive=true;
  void fetch(url).then(r=>r.arrayBuffer()).then(b=>e.load(b)).then(async r=>{if(!alive)return;setSize(`${r.width} x ${r.height} px decoded source`);draw(before.current,await e.render(neutralDevelop));if(alive)setReady(true);}).catch(e=>{if(alive)setError(String(e));});
  return()=>{alive=false;generation.current++;e.dispose();engine.current=null;};},[url,enabled]);
 // Debounce changes: one in-flight render, newest settings only; stale output never paints.
 const wanted=useRef(now);wanted.current=now;
 const running=useRef(false);
 useEffect(()=>{if(!ready)return;const timer=setTimeout(async()=>{
  if(running.current)return;const e=engine.current;if(!e)return;const g=generation.current;
  running.current=true;setBusy(true);let seen:DevelopSettings|undefined;
  try{while(engine.current===e&&seen!==wanted.current){seen=wanted.current;const r=await e.render(seen);if(engine.current===e&&seen===wanted.current)draw(after.current,r);}}
  catch(error){if(engine.current===e)setError(String(error));}finally{running.current=false;if(g===generation.current)setBusy(false);}
 },120);return()=>clearTimeout(timer);},[ready,now]);
 const change=(next:DevelopSettings)=>{state.past=[...state.past.slice(-49),state.now];state.now=next;state.future=[];refresh(v=>v+1);};
 const history=(redo:boolean)=>{const from=redo?state.future:state.past,to=redo?state.past:state.future;const next=from.pop();if(next){to.push(state.now);state.now=next;refresh(v=>v+1);}};
 const save=async(format:'png'|'jpeg')=>{const e=engine.current;if(!e||busy)return;setBusy(true);setError('');const snapshot=state.now;try{const r=await e.export(snapshot,format);if(!r.bytes)throw Error('Export returned no bytes.');const host=await defaultImageHost();if(await host.save(new Blob([r.bytes],{type:format==='png'?'image/png':'image/jpeg'}),editedName(name,format==='png'?'png':'jpg'))){state.saved=signature(snapshot);refresh(v=>v+1);}}catch(e){setError(String(e));}finally{setBusy(false);}};
 return <section className="p-3 flex flex-col gap-3 text-xs" aria-label="LightCraft Develop">
 <strong>{photosEngines.lightcraft.label}</strong>
 <p>Separate original-photo development. Raster edits, selections, layers and AI proposals are not applied here.</p>
 <p>Session-only settings. Copy export is capped at 2048 px, 8-bit sRGB, with metadata removed. Originals are never overwritten.</p>
 {!enabled?<Button disabled={!url||c.busy||!!c.layerQuery||!!c.selection} onClick={()=>setEnabled(true)}>Enable experimental Develop</Button>:<>
 <div className="flex flex-col gap-2"><span>Original development</span><canvas ref={before} aria-label="Before development" style={{width:'100%',height:'auto',borderRadius:10}}/><span>Developed preview</span><canvas ref={after} aria-label="After development" style={{width:'100%',height:'auto',borderRadius:10}}/></div>
 {(['exposure','contrast','saturation'] as const).map(key=><label key={key} className="flex flex-col gap-1">{key[0].toUpperCase()+key.slice(1)} {now[key]}<input aria-label={`Develop ${key}`} type="range" min={key==='exposure'?-3:-100} max={key==='exposure'?3:100} step={key==='exposure'?0.1:1} value={now[key]} disabled={!ready} onChange={e=>change({...now,[key]:Number(e.currentTarget.value)})}/></label>)}
 <div className="flex flex-wrap gap-1"><Button size="compact" disabled={!state.past.length} onClick={()=>history(false)}>Undo Develop</Button><Button size="compact" disabled={!state.future.length} onClick={()=>history(true)}>Redo Develop</Button><Button size="compact" onClick={()=>change({...neutralDevelop})}>Reset Develop</Button></div>
 <div className="flex flex-wrap gap-1"><Button size="compact" disabled={!ready||busy} onClick={()=>void save('png')}>Export Develop PNG copy</Button><Button size="compact" disabled={!ready||busy} onClick={()=>void save('jpeg')}>Export Develop JPEG copy</Button></div>
 <span role="status">{!ready?'Loading engine...':busy?'Developing...':signature(now)!==state.saved?'Session edits, not exported':'No unexported changes'} {size}</span>
 </>}{error&&<p role="alert">{error}</p>}
 </section>;
}
