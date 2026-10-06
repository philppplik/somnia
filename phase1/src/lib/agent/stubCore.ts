import type {AgentCore, AgentEvent, AgentProposal, AgentRun, AgentRequest} from './core';
/**
 * Scripted stand-in for the real agent core. It streams a fixed reply and proposes one fixed diff
 * (the example from the design spec). It never touches the project, the editor or the disk.
 */
export const STUB_REPLY = "Alright, lets rock this! I raised the headline size and tightened the line height.";
let counter = 0;
export function stubProposal(file: string): AgentProposal {
 return {id: `stub-${++counter}`, file, added: 1, removed: 1, lines: [
  {kind: 'del', text: 'h1 { font-size: 40px; }'},
  {kind: 'add', text: 'h1 { font-size: 56px; line-height: 1.05; }'}]};
}
export interface StubOptions {charDelayMs?: number; statusDelayMs?: number}
export function createStubCore(options: StubOptions = {}): AgentCore {
 const charDelay = options.charDelayMs ?? 30, statusDelay = options.statusDelayMs ?? 700;
 return {
  run(request: AgentRequest, onEvent: (e: AgentEvent) => void): AgentRun {
   let stopped = false;const timers = new Set<ReturnType<typeof setTimeout>>();
   const later = (ms: number, fn: () => void) => {const t = setTimeout(() => {timers.delete(t);if (!stopped) fn();}, ms);timers.add(t);};
   const file = request.context.activeFile || 'index.html';
   onEvent({type: 'status', text: 'Editing', file});
   later(statusDelay, () => {
    let i = 0;
    const tick = () => {
     if (i < STUB_REPLY.length) {const n = Math.min(3, STUB_REPLY.length - i);onEvent({type: 'text-delta', text: STUB_REPLY.slice(i, i + n)});i += n;later(charDelay, tick);}
     else {onEvent({type: 'proposal', proposal: stubProposal(file)});onEvent({type: 'done'});}
    };
    tick();
   });
   return {cancel() {stopped = true;timers.forEach(clearTimeout);timers.clear();}};
  },
  async applyProposal() {},
  async rejectProposal() {},
  async revertProposal() {},
 };
}
export const stubCore: AgentCore = createStubCore();
