import { invoke, isTauri } from '@tauri-apps/api/core';
import { commandDispatcher } from '../commandDispatcher';
import { registerCoreCommandSpec } from '../coreCommandRegistration';
export type RunKind = 'install' | 'dev' | 'build';
export interface RunnerHandle { id: string; projectId: string; kind: RunKind; state: 'starting'|'running'|'exited'|'stopped'|'timedOut'; port?: number|null; previewToken?: string|null; url?: string|null; exitCode?: number|null }
export interface LogLine { sequence: number; stream: 'stdout'|'stderr'; text: string }
export interface RuntimeStatus { installed: boolean; supported: boolean; version: string; downloadBytes: number }
export interface ProjectRunner {
  start(projectId: string, kind: RunKind): Promise<RunnerHandle>;
  stop(runId: string): Promise<void>;
  status(runId: string): Promise<RunnerHandle>;
  onLog(runId: string, listener: (line: LogLine) => void): () => void;
}
type IPC = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export class NativeProjectRunner implements ProjectRunner {
  constructor(private readonly ipc: IPC = invoke, private readonly interval = 250) {}
  start(projectId: string, kind: RunKind) { return commandDispatcher.runCommand<RunnerHandle>('frameworks.run', {projectId, kind}, {origin:'ui'}); }
  stop(runId: string) { return this.ipc<void>('project_stop', {runId}); }
  status(runId: string) { return this.ipc<RunnerHandle>('project_status', {runId}); }
  onLog(runId: string, listener: (line: LogLine) => void) {
    let alive = true, afterSequence = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const reply = await this.ipc<{lines: LogLine[]; nextSequence: number}>('project_logs', {runId, afterSequence});
        if (!alive) return;
        for (const line of reply.lines) { listener(line); }
        afterSequence = reply.nextSequence;
        const state = await this.status(runId);
        // One final drain after exit; readers may deliver the last chunk after status changes.
        if (state.state !== 'running' && state.state !== 'starting') {
          for (let page = 0; alive && page < 2048; page++) {
            const tail = await this.ipc<{lines: LogLine[]; nextSequence?:number}>('project_logs', {runId, afterSequence});
            if (!alive) return;
            for (const line of tail.lines) listener(line);
            if (tail.lines.length < 256) break;
            afterSequence = tail.nextSequence ?? tail.lines.at(-1)!.sequence;
          }
          alive = false; return;
        }
      } catch { alive = false; return; }
      if (alive) timer = setTimeout(read, this.interval);
    };
    void read();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }
}
const empty = {type:'object', properties:{}, additionalProperties:false};
registerCoreCommandSpec({id:'frameworks.run', title:'Run framework project', category:'Project', level:'ui', params:{type:'object', properties:{projectId:{type:'string',minLength:1},kind:{enum:['install','dev','build']}},required:['projectId','kind'],additionalProperties:false}, enabled:()=>isTauri(), run:(p: {projectId:string;kind:RunKind})=>invoke<RunnerHandle>('project_run',p)});
registerCoreCommandSpec({id:'frameworks.installHelper',title:'Download framework helper',category:'Tools',level:'ui',params:{type:'object',properties:{consent:{const:true}},required:['consent'],additionalProperties:false},enabled:()=>isTauri(),run:()=>invoke<RuntimeStatus>('runtime_install',{consent:true})});
registerCoreCommandSpec({id:'frameworks.removeHelper',title:'Remove framework helper',category:'Tools',level:'ui',params:empty,enabled:()=>isTauri(),run:()=>invoke<RuntimeStatus>('runtime_remove')});
export const projectRunner: ProjectRunner = new NativeProjectRunner();
export const runtimeStatus = () => isTauri() ? invoke<RuntimeStatus>('runtime_status') : Promise.resolve<RuntimeStatus>({installed:false,supported:false,version:'24.21.0',downloadBytes:41943040});
export const installRuntime = () => commandDispatcher.runCommand<RuntimeStatus>('frameworks.installHelper',{consent:true}, {origin:'ui'});
export const removeRuntime = () => commandDispatcher.runCommand<RuntimeStatus>('frameworks.removeHelper',{}, {origin:'ui'});

for (const [id, name, title] of [['frameworks.openPreview','preview_open','Open framework preview'],['frameworks.closePreview','preview_close','Close framework preview']] as const) {
 registerCoreCommandSpec({id,title,category:'View',level:'ui',params:{type:'object',properties:{runId:{type:'string',minLength:1}},required:['runId'],additionalProperties:false},enabled:()=>isTauri(),run:(p:{runId:string})=>invoke<void>(name,p)});
}
export const openFrameworkPreview = (runId:string) => commandDispatcher.runCommand<void>('frameworks.openPreview',{runId},{origin:'ui'});
export const closeFrameworkPreview = (runId:string) => commandDispatcher.runCommand<void>('frameworks.closePreview',{runId},{origin:'ui'});
export interface FrameworkSourceEvent { projectId:string; file:string; line:number; col:number }
