import type {StaticBuildState} from '../lib/frameworks/staticBuild';
import {Button} from './ui/button';
type T=(key:string,params?:Record<string,string|number>)=>string;
export const formatBytes=(n:number)=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
/** Pure view so it renders in tests and screenshots without native APIs. */
export function FrameworkBuildView({state,busy,onBuild,onCancel,t}:{state:StaticBuildState;busy:boolean;onBuild:()=>void;onCancel:()=>void;t:T}){
 const s=state.summary;
 return <section className="border-b border-subtle px-3 py-2 text-[11px]" data-testid="framework-build" aria-label={t('frameworks.build.title')}>
  <div className="flex items-center gap-2"><span className="font-medium text-ink">{t('frameworks.build.title')}</span><span className="grow"/>
   {busy?<Button variant="outline" size="compact" onClick={onCancel}>{t('frameworks.build.cancel')}</Button>:<Button variant="outline" size="compact" onClick={onBuild}>{t(s?'frameworks.build.again':'frameworks.build.start')}</Button>}</div>
  <p className="mt-1 text-ink-2" role="status" aria-live="polite">{state.phase==='idle'?t('frameworks.build.hint'):state.phase==='failed'?'':t(`frameworks.build.phase.${state.phase}`)}</p>
  {state.phase==='failed'&&<p className="mt-1 text-warning" role="alert" data-testid="framework-build-error">{t(state.errorKey??'frameworks.build.failed')}{state.errorPath?<> <code>{state.errorPath}</code></>:null}</p>}
  {s&&<div className="mt-2 space-y-1" data-testid="framework-build-result">
   <p>{s.node?t('frameworks.build.nodeResult',{count:s.fileCount,size:formatBytes(s.totalBytes),entry:s.node.entry}):t('frameworks.build.result',{count:s.fileCount,size:formatBytes(s.totalBytes),dist:s.dist})}</p>
   {s.node&&<p className="text-ink-2" data-testid="framework-build-node">{t('frameworks.build.nodeNote')}</p>}
   {s.node?.install&&<p className="text-ink-2" role="note" data-testid="framework-build-install">{t('frameworks.build.installNote')}</p>}
   <p className="text-ink-2">{t('frameworks.build.id')} <code>{s.manifest.buildId.slice(0,12)}</code></p>
   <details><summary className="cursor-pointer text-ink-2">{t('frameworks.build.files')}</summary><ul className="mt-1 max-h-32 overflow-auto font-mono text-[10px]">{s.manifest.files.slice(0,200).map(f=><li key={f.path} className="flex gap-2"><span className="grow truncate">{f.path}</span><span className="text-ink-2">{formatBytes(f.size)}</span></li>)}</ul></details>
   {s.spaRules&&<details data-testid="framework-build-spa"><summary className="cursor-pointer text-ink-2">{t('frameworks.build.spa')}</summary><p className="mt-1 text-ink-2">{t('frameworks.build.spaNote')}</p><pre data-copyable className="mt-1 overflow-auto whitespace-pre-wrap rounded bg-base p-2 font-mono text-[10px]">{s.spaRules.nginx}</pre><pre data-copyable className="mt-1 overflow-auto whitespace-pre-wrap rounded bg-base p-2 font-mono text-[10px]">{s.spaRules.apache}</pre></details>}
  </div>}
 </section>;
}
