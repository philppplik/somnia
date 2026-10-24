/** F1 owns the native runner. This shape mirrors its public interface and is used by mock tests. */
export type RunKind='install'|'dev'|'build';
export type RunState='starting'|'running'|'exited'|'stopped'|'timedOut';
export interface RunnerHandle{id:string;projectId:string;kind:RunKind;state:RunState;port?:number|null;previewToken?:string|null;url?:string|null;exitCode?:number|null}
export interface RunnerLog {stream:'stdout'|'stderr';line:string}
export interface ProjectRunner{
 start(projectId:string,kind:RunKind):Promise<RunnerHandle>;
 stop(id:string):Promise<unknown>;
 status(id:string):Promise<RunnerHandle>;
 onLog(id:string,listener:(log:RunnerLog)=>void):(()=>void)|Promise<()=>void>;
}
