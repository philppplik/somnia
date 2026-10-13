import type {ProjectRunner,RunnerHandle,RunnerLog} from './runnerContract';
import type {DeployArtifactManifest} from '../deploy/types';
/** Result of a finished build, as summarised by the native collector. Paths are relative, no bytes, no secrets. */
export interface StaticArtifactSummary{framework:string;dist:string;manifest:DeployArtifactManifest;fileCount:number;totalBytes:number;spaRules:{nginx:string;apache:string}|null}
export type StaticBuildPhase='idle'|'installing'|'building'|'collecting'|'done'|'failed';
export interface StaticBuildState{phase:StaticBuildPhase;projectId:string;errorKey?:string;/** Offending relative path for link/forbidden errors. */errorPath?:string;summary?:StaticArtifactSummary;logs:readonly RunnerLog[]}
export type CollectArtifact=(runId:string)=>Promise<StaticArtifactSummary>;
const ERROR_KEYS=new Set(['noPackage','notStatic','distMissing','noIndex','empty','tooLarge','tooMany','unsafePath','link','forbidden','io','notBuild','buildNotFinished']);
/** Maps a native `frameworks.artifact.<code>[:path]` string to a catalogue key. Unknown text never reaches the UI. */
export function artifactError(raw:unknown):{key:string;path?:string}{
 const text=raw instanceof Error?raw.message:typeof raw==='string'?raw:'';
 const m=/^frameworks\.artifact\.([A-Za-z]+)(?::(.{1,300}))?$/.exec(text);
 if(!m||!ERROR_KEYS.has(m[1]))return {key:'frameworks.build.failed'};
 const path=m[2]&&!/[\\\0]|^\/|\.\./.test(m[2])?m[2]:undefined;
 return {key:`frameworks.artifact.${m[1]}`,path};
}
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
export interface StaticBuildOptions{redact?:(s:string)=>string;pollMs?:number;/** Overall wait, the native runner enforces its own 5 minute build timeout. */timeoutMs?:number}
/**
 * Build a framework project for publishing: optional install, one `build` run, then the native collector
 * walks the output and hashes it. Nothing is uploaded. A failed or cancelled build never yields a manifest.
 */
export function createStaticBuilder(runner:ProjectRunner,collect:CollectArtifact,opts:StaticBuildOptions={}){
 const redact=opts.redact??((s:string)=>s),pollMs=opts.pollMs??200,timeoutMs=opts.timeoutMs??15*60_000;
 let state:StaticBuildState={phase:'idle',projectId:'',logs:[]};let generation=0;let off:(()=>void)|undefined;let current:RunnerHandle|undefined;const listeners=new Set<()=>void>();
 const set=(next:Partial<StaticBuildState>)=>{state={...state,...next};listeners.forEach(fn=>fn());};
 async function watch(handle:RunnerHandle,own:number){off?.();const stop=await runner.onLog(handle.id,line=>{if(own!==generation)return;set({logs:[...state.logs.slice(-499),{stream:line.stream,line:redact(line.line).slice(0,4000)}]});});if(own!==generation)stop();else off=stop;}
 async function finish(handle:RunnerHandle,own:number){current=handle;await watch(handle,own);const until=Date.now()+timeoutMs;
  while(handle.state==='running'||handle.state==='starting'){if(own!==generation){await runner.stop(handle.id);throw Error('cancelled');}if(Date.now()>until){await runner.stop(handle.id);throw Error('timeout');}await sleep(pollMs);handle=await runner.status(handle.id);}
  if(handle.state!=='exited'||handle.exitCode!==0)throw Error('build');return handle;}
 return {getSnapshot:()=>state,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
  async run(projectId:string,install=false){const own=++generation;off?.();set({phase:install?'installing':'building',projectId,errorKey:undefined,errorPath:undefined,summary:undefined,logs:[]});
   try{
    if(install){await finish(await runner.start(projectId,'install'),own);if(own!==generation)return;set({phase:'building'});}
    const built=await finish(await runner.start(projectId,'build'),own);if(own!==generation)return;
    set({phase:'collecting'});const summary=await collect(built.id);if(own!==generation)return;
    set({phase:'done',summary});
   }catch(error){if(own!==generation)return;
    const message=error instanceof Error?error.message:'';
    if(message==='cancelled')return;
    if(message==='timeout')set({phase:'failed',errorKey:'frameworks.build.timeout'});
    else if(message==='build')set({phase:'failed',errorKey:'frameworks.build.failed'});
    else{const e=artifactError(error);set({phase:'failed',errorKey:e.key,errorPath:e.path});}}
   finally{if(own===generation){off?.();off=undefined;current=undefined;}}},
  async cancel(){++generation;off?.();off=undefined;const h=current;current=undefined;set({phase:'idle',summary:undefined,errorKey:undefined,errorPath:undefined});if(h)await runner.stop(h.id);}};
}
export type StaticBuilder=ReturnType<typeof createStaticBuilder>;
