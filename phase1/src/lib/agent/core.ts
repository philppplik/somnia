/**
 * Somnia Agent core interface, as the side panel consumes it.
 *
 * The real core is built in parallel on branch agent/core. Until it lands the panel talks to this
 * interface and runs against `stubCore` (see stubCore.ts). Assumptions are listed in notes/AGENT-PANEL.md.
 * Wiring the real core is one call: `setAgentCore(realCore)`.
 */
export interface AgentContext {
 /** File the user is looking at, as in appStore.activeFile. */
 activeFile: string;
 /** Selected canvas element id, if any. */
 selectedElementId: string | null;
}
export interface AgentRequest {
 prompt: string;
 context: AgentContext;
}
export type DiffLine = {kind: 'add' | 'del' | 'ctx'; text: string};
/** One reviewable change to one file. Originals stay untouched until `applyProposal`. */
export interface AgentProposal {
 id: string;
 file: string;
 lines: DiffLine[];
 added: number;
 removed: number;
}
/** Events a run streams back. Order: status? text-delta* proposal* then exactly one of done | error. */
export type AgentEvent =
 | {type: 'status'; text: string; file?: string}
 | {type: 'text-delta'; text: string}
 | {type: 'proposal'; proposal: AgentProposal}
 | {type: 'done'}
 | {type: 'error'; message: string};
export interface AgentRun {
 /** Stops the run. No further events are delivered afterwards. */
 cancel(): void;
}
export interface AgentCore {
 /** Starts a run. Events arrive asynchronously through `onEvent`. */
 run(request: AgentRequest, onEvent: (event: AgentEvent) => void): AgentRun;
 /** Takes the proposal into the editor (not onto disk). Rejects if it no longer applies. */
 applyProposal(id: string): Promise<void>;
 /** Discards a pending proposal. */
 rejectProposal(id: string): Promise<void>;
 /** Reverts a proposal that was applied. */
 revertProposal(id: string): Promise<void>;
}
let active: AgentCore | null = null;
/** Replaces the core used by the panel. Pass null to fall back to the stub. */
export function setAgentCore(core: AgentCore | null): void {
 active = core;
}
export async function getAgentCore(): Promise<AgentCore> {
 if (active) return active;
 const {stubCore} = await import('./stubCore');
 return stubCore;
}
