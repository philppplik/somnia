/** Isolated pixel-review fixture for the CA1 cross-studio handoff row, not an app/WASM/E2E substitute. */
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SlidesTableHandoff} from '../src/components/slides/SlidesTableHandoff';
import {SheetsHandoffBar} from '../src/components/sheets/SheetsHandoffBar';
import {useMedia} from '../src/lib/media';
import {readXlsx} from '../src/lib/office/xlsx';
import {setLocale} from '../src/lib/i18n';
import '../src/styles/global.css';
if(!import.meta.env.DEV)throw Error('Development fixture only.');
const params=new URLSearchParams(location.search);document.documentElement.dataset.theme=params.get('theme')??'light';setLocale(params.get('locale')??'en');
const CELLS=[['Name','Qty'],['Apples','3'],['Pie','2.5']];
const RETURNED=[['Name','Qty'],['Apples','4'],['Cake','2.5']];
function Fixture(){
 const media=useMedia();
 const active=media.items.find(i=>i.name===media.active);
 const [applied,setApplied]=useState<string[]>([]);
 const [sheetDump,setSheetDump]=useState('');
 const [error,setError]=useState('');
 if(active?.kind==='xlsx'){
  if(!sheetDump)void fetch(active.url).then(r=>r.arrayBuffer()).then(b=>{const {sheets}=readXlsx(new Uint8Array(b));setSheetDump(JSON.stringify(sheets[0]?.rows??[]));}).catch(e=>setSheetDump('ERR '+String(e)));
  return <div className="min-h-screen bg-hover p-6"><div className="w-[560px] rounded border border-subtle bg-panel">
   <SheetsHandoffBar file={active.name} disabled={false} onError={setError} getRows={async()=>RETURNED}/>
   <p data-testid="sheet-dump" className="m-0 px-3 py-1 text-xs text-ink-3">{sheetDump}</p>
   {error&&<p role="alert" className="m-0 px-3 py-1 text-xs text-danger">{error}</p>}
  </div></div>;
 }
 return <div className="min-h-screen bg-hover p-6"><div className="w-[560px] rounded border border-subtle bg-panel p-2">
  <SlidesTableHandoff source="quarterly.pptx" slideIndex={2} slideId={257} shapeId={7} cells={CELLS} ready={true} isBusy={()=>false} commit={()=>undefined}
   editCell={async(r,c,text)=>{setApplied(a=>[...a,`${r}:${c}:${text}`]);return{ok:true};}} onError={setError}/>
  <p data-testid="applied" className="m-0 px-1 py-1 text-xs text-ink-3">{applied.join(' | ')}</p>
  {error&&<p role="alert" className="m-0 px-1 py-1 text-xs text-danger">{error}</p>}
 </div></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
