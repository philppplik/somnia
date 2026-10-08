import {useEffect,useState} from 'react';
import type {MediaItem} from '../lib/media';
import {formatBytes} from '../lib/media';
import type {DocxView} from '../lib/office/docx';
import type {Sheet} from '../lib/office/xlsx';
import {useT} from '../lib/useT';
const bar='media-bar flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-[12px] text-ink-2 hover:bg-hover';
function download(name:string,data:BlobPart,mime:string){const url=URL.createObjectURL(new Blob([data],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const stem=(n:string)=>n.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'');
function useBytes(item:MediaItem){const [bytes,setBytes]=useState<Uint8Array|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let live=true;setBytes(null);setError('');fetch(item.url).then(r=>r.arrayBuffer()).then(b=>{if(live)setBytes(new Uint8Array(b));}).catch(e=>{if(live)setError(String(e?.message??e));});return()=>{live=false;};},[item.url]);
 return {bytes,error,setError};}
function Notes({warnings}:{warnings:string[]}){return warnings.length?<ul className="px-3 py-2 text-[12px] text-ink-3" role="note" data-testid="office-warnings">{warnings.map(w=><li key={w}>{w}</li>)}</ul>:null;}
export function DocxViewer({item}:{item:MediaItem}){const {t}=useT();const {bytes,error,setError}=useBytes(item);
 const [view,setView]=useState<(DocxView&{srcdoc:string})|null>(null);
 useEffect(()=>{if(!bytes)return;let live=true;(async()=>{try{const {docxToView,docxSrcdoc}=await import('../lib/office/docx');const v=await docxToView(bytes);if(live)setView({...v,srcdoc:docxSrcdoc(v.html)});}catch(e:any){if(live)setError(String(e?.message??e));}})();return()=>{live=false;};},[bytes,setError]);
 const toMd=async()=>{if(!bytes)return;try{const {convertDocument}=await import('../lib/conversion/documents');const r=await convertDocument({from:'docx',to:'md',data:bytes,title:stem(item.name)});download(stem(item.name)+'.md',r.data as BlobPart,r.mimeType);}catch(e:any){setError(String(e?.message??e));}};
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('office.docx.title')}>
  <div className={bar}><span className="truncate" data-testid="media-name">{item.name}</span><span className="text-ink-3">DOCX, {formatBytes(item.size)}</span><span className="rounded-sm bg-hover px-1.5 text-ink-2" data-testid="office-readonly">{t('office.readonly')}</span><span className="flex-1"/>
   <button className={tool} disabled={!bytes||!!error} onClick={toMd} aria-label={t('office.docx.toMd')}>{t('office.docx.toMd')}</button></div>
  {error?<p className="px-3 py-2 text-[12px] text-red-600" role="alert" data-testid="office-error">{error}</p>:<>
   {view&&<Notes warnings={view.warnings}/>}
   {view?<iframe sandbox="" title={t('office.docx.frameTitle',{name:item.name})} data-testid="docx-frame" srcDoc={view.srcdoc} className="min-h-0 w-full flex-1 border-0 bg-white"/>:<p className="px-3 py-2 text-[12px] text-ink-3" role="status">{t('office.loading')}</p>}</>}
 </section>;}
export function XlsxViewer({item}:{item:MediaItem}){const {t}=useT();const {bytes,error,setError}=useBytes(item);
 const [data,setData]=useState<{sheets:Sheet[];warnings:string[]}|null>(null);const [active,setActive]=useState(0);
 useEffect(()=>{if(!bytes)return;let live=true;(async()=>{try{const {readXlsx}=await import('../lib/office/xlsx');const d=readXlsx(bytes);if(live){setData(d);setActive(0);}}catch(e:any){if(live)setError(String(e?.message??e));}})();return()=>{live=false;};},[bytes,setError]);
 const sheet=data?.sheets[active];
 const toCsv=async()=>{if(!sheet)return;const {sheetToCsv}=await import('../lib/office/xlsx');download(`${stem(item.name)}-${sheet.name}.csv`,'\ufeff'+sheetToCsv(sheet.rows),'text/csv;charset=utf-8');};
 const width=sheet?Math.max(0,...sheet.rows.map(r=>r.length)):0;
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('office.xlsx.title')}>
  <div className={bar}><span className="truncate" data-testid="media-name">{item.name}</span><span className="text-ink-3">XLSX, {formatBytes(item.size)}</span><span className="rounded-sm bg-hover px-1.5 text-ink-2" data-testid="office-readonly">{t('office.readonly')}</span><span className="flex-1"/>
   <button className={tool} disabled={!sheet} onClick={toCsv} aria-label={t('office.xlsx.toCsv')}>{t('office.xlsx.toCsv')}</button></div>
  {error?<p className="px-3 py-2 text-[12px] text-red-600" role="alert" data-testid="office-error">{error}</p>:!data?<p className="px-3 py-2 text-[12px] text-ink-3" role="status">{t('office.loading')}</p>:<>
   <Notes warnings={data.warnings}/>
   <div role="tablist" className="flex gap-1 border-b border-subtle px-3">{data.sheets.map((s,i)=><button key={s.name} role="tab" aria-selected={i===active} onClick={()=>setActive(i)} className={tool+(i===active?' bg-hover font-semibold':'')}>{s.name}</button>)}</div>
   <div className="min-h-0 flex-1 overflow-auto p-3"><table className="text-[12px]" data-testid="xlsx-table" style={{borderCollapse:'collapse'}}><tbody>
    {sheet?.rows.map((r,ri)=><tr key={ri}><th scope="row" className="border border-subtle bg-hover px-2 text-ink-3 font-normal">{ri+1}</th>{Array.from({length:width},(_,ci)=>{const v=r[ci];return <td key={ci} className="border border-subtle px-2 py-0.5 whitespace-pre-wrap" style={typeof v==='number'?{textAlign:'right'}:undefined}>{v===null||v===undefined?'':String(v)}</td>;})}</tr>)}</tbody></table></div></>}
 </section>;}
