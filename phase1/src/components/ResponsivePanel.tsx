import {useT} from '../lib/useT';
import {useMemo,useState} from 'react';
import {applyOperations,breakpointFor,jumpToLine,patchState,useAppStore} from '../store/appStore';
import {isCss} from '../lib/cssTools';
import {appendMediaWidth,listMediaWidths,updateMediaWidth,validMediaWidth,type MediaWidth} from '../lib/responsiveBreakpoints';
const input='h-7 min-w-0 w-full! rounded-sm border border-subtle bg-transparent px-2! py-0! text-xs';
const button='min-h-7 shrink-0 whitespace-nowrap rounded-sm border border-subtle bg-transparent px-2 text-[11px] text-ink-2 disabled:opacity-40';
export function ResponsivePanel(){
 const {t}=useT();
 const s=useAppStore();const entries=useMemo(()=>listMediaWidths(s.files),[s.files]);const cssFiles=Object.keys(s.files).filter(isCss);
 const [file,setFile]=useState('');const [kind,setKind]=useState<'min'|'max'>('max');const [width,setWidth]=useState('768');const [error,setError]=useState<string|null>(null);
 const target=cssFiles.includes(file)?file:cssFiles[0]??'';
 const scopes=[...new Set(entries.filter(x=>x.canScope).map(x=>x.width))].sort((a,b)=>a-b);
 if(typeof s.responsiveScope==='number'&&!scopes.includes(s.responsiveScope))scopes.push(s.responsiveScope);
 const commit=(entry:MediaWidth,value:string)=>{
  if(Number(value)===entry.width&&validMediaWidth(value))return;
  const text=updateMediaWidth(s.files,entry,value);if(text===null){setError(t('panels.responsive.useAWholeWidthFrom'));return;}
  try{applyOperations([{type:'replaceSource',file:entry.file,text}],'code');setError(null);
   if(entry.canScope&&s.responsiveScope===entry.width)patchState({responsiveScope:Number(value)});
  }catch(e){setError(String(e));}
 };
 const add=()=>{const text=appendMediaWidth(s.files,target,kind,width);if(text===null){setError(t('panels.responsive.chooseACSSFileAnd'));return;}
  try{applyOperations([{type:'replaceSource',file:target,text}],'code');setError(null);patchState({notice:t('panels.responsive.addedAnEmptyMediaQuery')});}catch(e){setError(String(e));}
 };
 return <section aria-label={t('panels.responsive.responsiveBreakpoints')} className="flex min-h-0 flex-1 flex-col gap-2">
  <label className="text-[11px] text-ink-2">{t('panels.responsive.visualEditScope')}<select aria-label={t('panels.responsive.responsiveEditScope')} className={input} value={s.responsiveScope===null?'base':String(s.responsiveScope)} onChange={e=>patchState({responsiveScope:e.target.value==='base'?null:e.target.value==='auto'?'auto':Number(e.target.value)})}>
   <option value="auto">{t('panels.responsive.autoLegacyViewportPresets')}</option><option value="base">{t('panels.responsive.baseAllWidths')}</option>{scopes.map(w=><option key={w} value={w}>{t('panels.responsive.maxWidth',{width:w})}</option>)}
  </select></label>
  <p className="m-0 text-[11px] leading-relaxed text-ink-3">{breakpointFor(s.viewport)===undefined?t('panels.responsive.visualEditsApplyAtAll'):t('panels.responsive.scope',{width:breakpointFor(s.viewport)!})} {t('panels.responsive.hint')}</p>
  {error&&<p role="alert" className="m-0 text-[11px] text-red-600">{error}</p>}
  <div className="min-h-0 flex-1 overflow-auto">{entries.map(entry=><div key={entry.file+entry.start} className="mb-3 flex flex-col gap-1 rounded-md bg-hover p-2">
   <button className="truncate border-0 bg-transparent p-0 text-left text-[11px] text-ink-2" title={`${entry.file}:${entry.line}`} aria-label={t('panels.responsive.showQuery',{file:entry.file,line:entry.line})} onClick={()=>jumpToLine(entry.file,entry.line)}>{entry.file}:{entry.line}</button>
   <code className="break-words text-[11px] text-ink">{entry.query}</code>
   <label className="flex items-center gap-2 text-[11px] text-ink-2"><span>{entry.kind}-width</span><input key={entry.width} className={input} aria-label={t('panels.responsive.queryWidth',{kind:entry.kind,file:entry.file,line:entry.line})} type="number" min="200" max="3840" step="1" defaultValue={entry.width} onBlur={e=>commit(entry,e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>px</span></label>
   <div className="flex flex-wrap gap-1"><button className={button} disabled={entry.width<200||entry.width>3840} onClick={()=>patchState({viewport:Math.round(entry.width)})} aria-label={t('panels.responsive.previewWidth',{width:entry.width})}>{t('panels.responsive.preview')}</button>{entry.canScope&&<button className={button} aria-label={t('panels.responsive.editWidth',{width:entry.width})} onClick={()=>patchState({responsiveScope:entry.width,viewport:entry.width})}>{t('panels.responsive.useEditScope')}</button>}</div>
  </div>)}{!entries.length&&<p className="text-xs text-ink-3">{t('panels.responsive.noPixelMinMaxWidth')}</p>}</div>
  <div className="flex flex-col gap-1 border-t border-subtle pt-2" role="group" aria-label={t('panels.responsive.addBreakpoint')}>
   <select className={input} aria-label={t('panels.responsive.breakpointStylesheet')} value={target} onChange={e=>setFile(e.target.value)}>{!cssFiles.length&&<option value="">{t('panels.responsive.addACSSFileFirst')}</option>}{cssFiles.map(f=><option key={f}>{f}</option>)}</select>
   <div className="grid grid-cols-2 gap-1"><select aria-label={t('panels.responsive.breakpointCondition')} className={input} value={kind} onChange={e=>setKind(e.target.value as 'min'|'max')}><option value="max">max-width</option><option value="min">min-width</option></select><input aria-label={t('panels.responsive.newBreakpointWidth')} className={input} type="number" min="200" max="3840" step="1" value={width} onChange={e=>setWidth(e.target.value)}/><button className={button+' col-span-2'} disabled={!target||!validMediaWidth(width)} onClick={add}>{t('panels.responsive.addQuery')}</button></div>
  </div>
 </section>;
}
