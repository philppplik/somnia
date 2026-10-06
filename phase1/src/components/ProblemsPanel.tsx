import {useT} from '../lib/useT';
import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CircleAlert} from '../lib/icons';
import {breakpointFor,jumpToLine,useAppStore} from '../store/appStore';
import {projectProblems} from '../lib/diagnostics';
/** Lists syntax problems and unclosed tags of all project files; a click opens the file at that line. Re-lints shortly after edits stop. */
export function ProblemsPanel(){
 const {t}=useT();
 const s=useAppStore();const [files,setFiles]=useState(s.files);
 useEffect(()=>{const t=window.setTimeout(()=>setFiles(s.files),300);return()=>window.clearTimeout(t);},[s.files]);
 const problems=useMemo(()=>projectProblems(files),[files]);
 const errors=problems.filter(p=>p.severity==='error').length;
 return <section className="problems-panel" aria-label={t('panels.problems.problems')} data-testid="problems-panel">
  <div className="flex items-center gap-3"><strong>{t('panels.problems.problems')}</strong><span className="text-[11px] text-ink-3" data-testid="problems-count">{problems.length===0?t('panels.problems.noProblemsFound'):t('panels.problems.summary',{errors:t('panels.problems.errors',{count:errors}),warnings:t('panels.problems.warnings',{count:problems.length-errors})})}</span></div>
  {problems.length>0&&<ul className="mt-2 max-h-40 list-none overflow-auto p-0 text-[11px]">{problems.map((p,i)=><li key={`${p.file}:${p.line}:${p.col}:${i}`}><button aria-label={t('panels.problems.location',{severity:t('panels.problems.'+p.severity),file:p.file,line:p.line,message:p.message})} onClick={()=>jumpToLine(p.file,p.line,p.col)} className="flex w-full items-center gap-2 rounded-sm border-0 bg-transparent px-1 py-0.5 text-left text-ink-2 hover:bg-hover">{p.severity==='error'?<CircleAlert size={12} className="shrink-0 text-red-500"/>:<AlertTriangle size={12} className="shrink-0 text-amber-500"/>}<span className="flex-1 truncate">{p.message}</span><code className="text-ink-3">{p.file}:{p.line}:{p.col}</code></button></li>)}</ul>}
  <p className="mt-2 text-[10px] text-ink-3">{t('panels.problems.selection')} <code>{s.selectedElementId??t('panels.problems.none')}</code> · {t('panels.problems.preview')} <code>{s.designFile}</code> · {breakpointFor(s.viewport)===undefined?t('panels.problems.baseStyles'):t('panels.problems.scope',{width:breakpointFor(s.viewport)!})}</p>
 </section>;
}
