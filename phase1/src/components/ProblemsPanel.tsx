import {useT} from '../lib/useT';
import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {AlertTriangle,CircleAlert} from '../lib/icons';
import {useAppStore} from '../store/appStore';
import {problemsProviders} from '../lib/problemsProviders';
import {useMathEngine} from '../lib/mathRender';
import {canNavigateProblem,navigateProblem,problemsStore} from '../lib/problemsRuntime';
import type {RuntimeProblem} from '../lib/problemsStore';
/** Same syntax producer as the gutter, plus session runtime failures from every studio. */
export function ProblemsPanel(){
 const {t}=useT();const s=useAppStore();const [files,setFiles]=useState(s.files);
 const runtime=useSyncExternalStore(problemsStore.subscribe,problemsStore.getSnapshot,problemsStore.getSnapshot);
 useEffect(()=>{const timer=window.setTimeout(()=>setFiles(s.files),300);return()=>window.clearTimeout(timer);},[s.files]);
 const engine=useMathEngine();
 const syntax=useMemo(()=>problemsProviders.collect({files}).map((p):RuntimeProblem=>({...p,details:'',ts:'',count:1})),[files,engine]);
 const problems=[...syntax,...runtime];const errors=problems.filter(p=>p.severity==='error').length;
 const studios=[...new Set(problems.map(p=>p.studio))].sort();
 return <section className="problems-panel !h-auto !border-t-0 flex max-h-[30vh] flex-col !p-3" aria-label={t('panels.problems.problems')} data-testid="problems-panel">
  <div className="flex shrink-0 items-center gap-3"><strong>{t('panels.problems.problems')}</strong><span className="text-[11px] text-ink-3" data-testid="problems-count" role="status">{problems.length===0?t('panels.problems.noProblemsFound'):t('panels.problems.summary',{errors:t('panels.problems.errors',{count:errors}),warnings:t('panels.problems.warnings',{count:problems.length-errors})})}</span><span className="grow"/><button className="border-0 bg-transparent text-[11px] text-ink-2 underline disabled:opacity-40" disabled={!runtime.length&&!problemsStore.getDropped()} onClick={()=>problemsStore.clear()}>{t('problems.clearRuntime')}</button></div>
  <div className="mt-2 min-h-0 overflow-auto text-[11px]">
   {problems.length===0&&<p data-testid="problems-empty">{t('problems.empty')}</p>}
   {studios.map(studio=><div key={studio} data-testid={`problems-studio-${studio}`}>
    <h3 className="mt-1 text-[11px] text-ink-2">{t(studio==='app'?'problems.application':`studio.${studio}`)}</h3>
    {(['error','warning'] as const).map(severity=>{const rows=problems.filter(p=>p.studio===studio&&p.severity===severity);return rows.length>0&&<div key={severity} data-severity={severity}><h4 className="my-1 text-[10px] text-ink-3">{t(`panels.problems.${severity}`)} ({rows.length})</h4><ul className="m-0 list-none p-0">{rows.map(p=><li key={p.key} data-testid="problem-row" className="py-0.5">
     <div className="flex items-start gap-2">{severity==='error'?<CircleAlert size={12} className="mt-1 shrink-0 text-red-500"/>:<AlertTriangle size={12} className="mt-1 shrink-0 text-amber-500"/>}<button aria-label={p.file?t('panels.problems.location',{severity:t(`panels.problems.${severity}`),file:p.file,line:p.line??1,message:p.message}):p.message} disabled={!canNavigateProblem(p)} onClick={()=>navigateProblem(p)} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left text-ink-2 hover:bg-hover"><span className="whitespace-pre-wrap break-words" data-copyable>{p.messageKey&&t(p.messageKey)!==p.messageKey?t(p.messageKey)+': ':''}{p.message}</span>{p.count>1&&<span className="ml-2 text-ink-3">×{p.count}</span>}<code className="ml-2 text-ink-3">{p.file?(p.file+(p.line?`:${p.line}:${p.col??1}`:'')):t('problems.noSource')}</code></button></div>
     {p.source!=='syntax'&&<details className="ml-5" data-testid="problem-details"><summary className="cursor-pointer text-ink-3">{t('problems.details')}</summary><pre data-copyable className="my-1 whitespace-pre-wrap break-words font-mono text-[10px] text-ink-2">{`${p.ts}\n${p.source}\n${p.details}`}</pre></details>}
    </li>)}</ul></div>;})}
   </div>)}
  </div>
  <p className="!mt-2 text-[10px] text-ink-3">{t('problems.session')}{problemsStore.getDropped()>0&&' '+t('problems.dropped',{count:problemsStore.getDropped()})}</p>
 </section>;
}
