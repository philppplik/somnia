/** Isolated pixel-review fixture for the shared Advanced Export dialog, not an app/WASM/E2E substitute. */
import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AdvancedExportDialog,type ExportPreview} from '../src/components/export/AdvancedExportDialog';
import {Button} from '../src/components/ui/button';
import {photoExportSchema,photoOptionsToValues,valuesToPhotoOptions,PHOTO_EXPORT_DEFAULTS,type PhotoAdvancedOptions} from '../src/lib/photos/photosExportSchema';
import {renderAdvancedPhotoExport} from '../src/lib/photos/advancedExport';
import type {PhotoSettings} from '../src/lib/photos/studioSettings';
import type {ExportValues,ExportValue} from '../src/lib/export/schema';
import {setLocale} from '../src/lib/i18n';
import '../src/styles/global.css';
if(!import.meta.env.DEV)throw Error('Development fixture only.');
const params=new URLSearchParams(location.search);document.documentElement.dataset.theme=params.get('theme')??'light';setLocale(params.get('locale')??'en');
const source=document.createElement('canvas');source.width=640;source.height=400;const c=source.getContext('2d')!;
const g=c.createLinearGradient(0,0,640,400);g.addColorStop(0,'#7756e8');g.addColorStop(1,'#ffb347');c.fillStyle=g;c.fillRect(0,0,640,400);
c.fillStyle='#2e9e6b';c.beginPath();c.arc(480,120,70,0,7);c.fill();
c.fillStyle='#202124';c.font='28px sans-serif';c.fillText('Somnia',40,360);
const sourceBlob=await new Promise<Blob>(r=>source.toBlob(b=>r(b!),'image/png'));
const sourceBytes=new Uint8Array(await sourceBlob.arrayBuffer());
const fakeEngine={exportPhoto:async(_settings:PhotoSettings,_format:'png'|'jpeg')=>({bytes:sourceBytes})};
const neutral={} as PhotoSettings;
function Fixture(){
 const [open,setOpen]=useState(true);
 const [exported,setExported]=useState('');
 const schema=photoExportSchema({width:640,height:400});
 const [values,setValues]=useState<ExportValues>(()=>({...photoOptionsToValues(PHOTO_EXPORT_DEFAULTS),name:'sample-photo'}));
 const [preview,setPreview]=useState<ExportPreview|null>(null);const [rendering,setRendering]=useState(false);
 const url=useRef<string|null>(null);const seq=useRef(0);
 const change=(id:string,value:ExportValue)=>setValues(v=>({...v,[id]:value}));
 useEffect(()=>{
  if(!open||schema.validate(values)!==null){setPreview(null);return;}
  const id=++seq.current;const timer=setTimeout(()=>{setRendering(true);
   renderAdvancedPhotoExport(fakeEngine,neutral,valuesToPhotoOptions(values)).then(r=>{
    if(seq.current!==id)return;
    if(url.current)URL.revokeObjectURL(url.current);
    url.current=URL.createObjectURL(r.blob);
    setPreview({url:url.current,bytes:r.bytes,width:r.width,height:r.height,note:r.note});setRendering(false);
   }).catch(()=>{if(seq.current===id)setRendering(false);});
  },200);
  return()=>clearTimeout(timer);
 },[values,open]);
 const onExport=async()=>{try{const options:PhotoAdvancedOptions=valuesToPhotoOptions(values);const r=await renderAdvancedPhotoExport(fakeEngine,neutral,options);
  const ext=options.format==='png'?'png':options.format==='webp'?'webp':'jpg';
  const a=document.createElement('a');a.href=URL.createObjectURL(r.blob);a.download=`${options.name}.${ext}`;a.click();
  setExported(`${a.download} · ${r.bytes} B`);}catch(e){setExported('ERR '+(e instanceof Error?e.message:String(e)));}};
 return <div className="grid min-h-screen place-items-center bg-hover p-6">
  <p data-testid="ae-exported" className="fixed bottom-2 left-2 m-0 text-xs text-ink-3">{exported}</p>
  <AdvancedExportDialog open={open} onClose={()=>setOpen(false)} schema={schema} values={values} onChange={change} onApply={p=>setValues(v=>({...v,...p,name:v.name}))} preview={preview} rendering={rendering} busy={false} errorKey={null} errorDetail="" onExport={()=>void onExport()}/>
  {!open&&<Button data-testid="ae-reopen" onClick={()=>setOpen(true)}>Reopen</Button>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
