/** F1 owns the native runner. This shape mirrors its public interface and is used by mock tests. */
export type RunKind='install'|'dev'|'build';
export type RunState='running'|'exited'|'stopped'|'timedOut';
export interface RunnerHandle{id:string;projectId:string;kind:RunKind;state:RunState;port?:number;previewToken?:string;url?:string;exitCode?:number}
export interface RunnerLog {stream:'stdout'|'stderr';line:string}
export interface ProjectRunner{
 start(projectId:string,kind:RunKind):Promise<RunnerHandle>;
 stop(id:string):Promise<unknown>;
 status(id:string):Promise<RunnerHandle>;
 onLog(id:string,listener:(log:RunnerLog)=>void):(()=>void)|Promise<()=>void>;
}
