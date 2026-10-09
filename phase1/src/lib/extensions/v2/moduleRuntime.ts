import {callApi, type ApiDeps} from '../api';
import type {ExtensionManifest} from '../types';

/** Experimental broker. The URL must come from a trusted asset resolver, never a manifest. */
export class ModuleRuntime {
  private readonly worker: Worker;
  private readonly port: MessagePort;
  private readonly pending = new Map<number, {resolve():void; reject(e:Error):void; timer:ReturnType<typeof setTimeout>}>();
  private seq = 0;
  private state: 'starting'|'ready'|'closed' = 'starting';
  private readonly ready: Promise<void>;
  private timer: ReturnType<typeof setTimeout>;
  private windowStart = Date.now();
  private calls = 0;
  constructor(private readonly manifest: ExtensionManifest, url: URL,
    private readonly deps: Omit<ApiDeps, 'registerHandler'>, private readonly timeoutMs = 5000) {
    // No source strings, Blob URLs, eval, or manifest-provided URLs.
    if (!['http:', 'https:', 'tauri:'].includes(url.protocol)) throw new Error('Unsupported worker asset scheme');
    this.worker = new Worker(url, {type: 'module', name: `somnia-extension-${manifest.id}`});
    const channel = new MessageChannel();
    this.port = channel.port1;
    let resolveReady!: () => void;
    let rejectReady!: (e:Error) => void;
    this.ready = new Promise((resolve, reject) => {resolveReady = resolve; rejectReady = reject;});
    // Observe rejection even when the owner never invokes a command.
    void this.ready.catch(() => {});
    this.timer = setTimeout(() => this.close(new Error('Extension activation timed out')), timeoutMs);
    this.port.onmessage = event => {
      const m = event.data;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'ready' && this.state === 'starting') {
        clearTimeout(this.timer); this.state = 'ready'; resolveReady();
      } else if (m.type === 'failed') this.close(new Error('Extension activation failed'));
      else if (m.type === 'api.call' && this.state !== 'closed') this.handleCall(m);
      else if (m.type === 'command.done' && this.state === 'ready' && Number.isSafeInteger(m.requestId)) {
        const run = this.pending.get(m.requestId);
        if (!run) return;
        clearTimeout(run.timer); this.pending.delete(m.requestId);
        typeof m.error === 'string' ? run.reject(new Error(m.error.slice(0, 500))) : run.resolve();
      }
    };
    this.port.onmessageerror = () => this.close(new Error('Invalid extension message'));
    this.worker.onerror = () => this.close(new Error('Extension worker failed'));
    this.worker.onmessageerror = () => this.close(new Error('Invalid worker message'));
    this.rejectReady = rejectReady;
    this.worker.postMessage({type:'connect'}, [channel.port2]);
  }
  private rejectReady: (e:Error) => void;
  private handleCall(m: {requestId:unknown; method:unknown; args:unknown}) {
    if (!Number.isSafeInteger(m.requestId) || (m.requestId as number) < 1) return;
    if (Date.now() - this.windowStart >= 1000) {this.windowStart = Date.now(); this.calls = 0;}
    if (++this.calls > 100) {this.close(new Error('Extension API rate limit exceeded')); return;}
    const result = (extra: object) => this.port.postMessage({type:'api.result', requestId:m.requestId, ...extra});
    try {
      if (typeof m.method !== 'string' || !Array.isArray(m.args)) throw new Error('Invalid API request');
      if (JSON.stringify(m.args).length > 100000) throw new Error('API request too large');
      // The PoC is read-only, regardless of v1 manifest permissions.
      if (m.method === 'editor.applyOperations') throw new Error('Writes are not enabled in the v2 PoC');
      const value = callApi(this.manifest, m.method, m.args, {...this.deps, registerHandler: () => {}});
      if (JSON.stringify(value)?.length > 1000000) throw new Error('API result too large');
      result({ok:true, value});
    } catch (error) {result({ok:false, error:error instanceof Error ? error.message.slice(0,500) : 'API call failed'});}
  }
  async runCommand(id:string):Promise<void> {
    if (!this.manifest.contributes.commands.some(c => c.id === id)) throw new Error('Undeclared command');
    await this.ready;
    if (this.state !== 'ready') throw new Error('Extension is closed');
    return new Promise((resolve,reject) => {
      const requestId = ++this.seq;
      const timer = setTimeout(() => this.close(new Error('Extension command timed out')), this.timeoutMs);
      this.pending.set(requestId,{resolve,reject,timer});
      this.port.postMessage({type:'command.run', id, requestId});
    });
  }
  private close(error:Error) {
    if (this.state === 'closed') return;
    this.state = 'closed'; clearTimeout(this.timer); this.rejectReady(error);
    for (const run of this.pending.values()) {clearTimeout(run.timer); run.reject(error);}
    this.pending.clear(); this.port.close(); this.worker.terminate();
  }
  dispose() {this.close(new Error('Extension disposed'));}
}
