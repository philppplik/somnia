import {useMemo,useState} from 'react';
import {applyOperations,breakpointFor,jumpToLine,patchState,useAppStore} from '../store/appStore';
import {isCss} from '../lib/cssTools';
import {appendMediaWidth,listMediaWidths,updateMediaWidth,validMediaWidth,type MediaWidth} from '../lib/responsiveBreakpoints';
const input='h-7 min-w-0 w-full! rounded-sm border border-subtle bg-transparent px-2! py-0! text-xs';
const button='min-h-7 shrink-0 whitespace-nowrap rounded-sm border border-subtle bg-transparent px-2 text-[11px] text-ink-2 disabled:opacity-40';
export function ResponsivePanel(){
 const s=useAppStore();const entries=useMemo(()=>listMediaWidths(s.files),[s.files]);const cssFiles=Object.keys(s.files).filter(isCss);
 const [file,setFile]=useState('');const [kind,setKind]=useState<'min'|'max'>('max');const [width,setWidth]=useState('768');const [error,setError]=useState<string|null>(null);
 const target=cssFiles.includes(file)?file:cssFiles[0]??'';
 const scopes=[...new Set(entries.filter(x=>x.canScope).map(x=>x.width))].sort((a,b)=>a-b);
 if(typeof s.responsiveScope==='number'&&!scopes.includes(s.responsiveScope))scopes.push(s.responsiveScope);
 const commit=(entry:MediaWidth,value:string)=>{
  if(Number(value)===entry.width&&validMediaWidth(value))return;
  const text=updateMediaWidth(s.files,entry,value);if(text===null){setError('Use a whole width from 200 to 3840 px. Refresh if the source changed.');return;}
  try{applyOperations([{type:'replaceSource',file:entry.file,text}],'code');setError(null);
   if(entry.canScope&&s.responsiveScope===entry.width)patchState({responsiveScope:Number(value)});
  }catch(e){setError(String(e));}
 };
 const add=()=>{const text=appendMediaWidth(s.files,target,kind,width);if(text===null){setError('Choose a CSS file and a whole width from 200 to 3840 px. Duplicate queries are not added.');return;}
  try{applyOperations([{type:'replaceSource',file:target,text}],'code');setError(null);patchState({notice:'Added an empty media query. Add rules in Code or select a max-width edit scope.'});}catch(e){setError(String(e));}
 };
 return <section aria-label="Responsive breakpoints" className="flex min-h-0 flex-1 flex-col gap-2">
  <label className="text-[11px] text-ink-2">Visual edit scope<select aria-label="Responsive edit scope" className={input} value={s.responsiveScope===null?'base':String(s.responsiveScope)} onChange={e=>patchState({responsiveScope:e.target.value==='base'?null:e.target.value==='auto'?'auto':Number(e.target.value)})}>
   <option value="auto">Auto (legacy viewport presets)</option><option value="base">Base (all widths)</option>{scopes.map(w=><option key={w} value={w}>Max-width {w} px</option>)}
  </select></label>
  <p className="m-0 text-[11px] leading-relaxed text-ink-3">{breakpointFor(s.viewport)===undefined?'Visual edits apply at all widths.':`Visual edits apply at ≤ ${breakpointFor(s.viewport)} px.`} Preview size is independent. Only simple max-width queries can scope visual edits.</p>
  {error&&<p role="alert" className="m-0 text-[11px] text-red-600">{error}</p>}
  <div className="min-h-0 flex-1 overflow-auto">{entries.map(entry=><div key={entry.file+entry.start} className="mb-3 flex flex-col gap-1 rounded-md bg-hover p-2">
   <button className="truncate border-0 bg-transparent p-0 text-left text-[11px] text-ink-2" title={`${entry.file}:${entry.line}`} aria-label={`Show media query in ${entry.file} line ${entry.line}`} onClick={()=>jumpToLine(entry.file,entry.line)}>{entry.file}:{entry.line}</button>
   <code className="break-words text-[11px] text-ink">{entry.query}</code>
   <label className="flex items-center gap-2 text-[11px] text-ink-2"><span>{entry.kind}-width</span><input key={entry.width} className={input} aria-label={`${entry.kind}-width in ${entry.file} line ${entry.line}`} type="number" min="200" max="3840" step="1" defaultValue={entry.width} onBlur={e=>commit(entry,e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>px</span></label>
   <div className="flex flex-wrap gap-1"><button className={button} disabled={entry.width<200||entry.width>3840} onClick={()=>patchState({viewport:Math.round(entry.width)})} aria-label={`Preview ${entry.width} px`}>Preview</button>{entry.canScope&&<button className={button} aria-label={`Edit at max-width ${entry.width} px`} onClick={()=>patchState({responsiveScope:entry.width,viewport:entry.width})}>Use edit scope</button>}</div>
  </div>)}{!entries.length&&<p className="text-xs text-ink-3">No pixel min/max-width queries found. Other media conditions stay in Code.</p>}</div>
  <div className="flex flex-col gap-1 border-t border-subtle pt-2" role="group" aria-label="Add breakpoint">
   <select className={input} aria-label="Breakpoint stylesheet" value={target} onChange={e=>setFile(e.target.value)}>{!cssFiles.length&&<option value="">Add a CSS file first</option>}{cssFiles.map(f=><option key={f}>{f}</option>)}</select>
   <div className="grid grid-cols-2 gap-1"><select aria-label="Breakpoint condition" className={input} value={kind} onChange={e=>setKind(e.target.value as 'min'|'max')}><option value="max">max-width</option><option value="min">min-width</option></select><input aria-label="New breakpoint width" className={input} type="number" min="200" max="3840" step="1" value={width} onChange={e=>setWidth(e.target.value)}/><button className={button+' col-span-2'} disabled={!target||!validMediaWidth(width)} onClick={add}>Add query</button></div>
  </div>
 </section>;
}
