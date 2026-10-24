import type {PublicationBackend, PublicationOutcome, PublicationPlan, PublicationTarget} from './types';
export interface PublicationState {busy: boolean; plan: PublicationPlan | null; confirmed: boolean; outcome: PublicationOutcome | null; error: boolean}
/** Defense in depth only. Native validation is mandatory, including rewrite/redirect handling. */
export function safeDestination(plan: PublicationPlan): boolean {
 if (!plan.destinationValidated || !plan.contentHash || !plan.head || !plan.planId) return false;
 try {
  const u = new URL(plan.effectiveRemoteUrl);
  if (u.username || u.password || u.search || u.hash) return false;
  if (plan.authRoute === 'github-https') return u.protocol === 'https:' && u.hostname === 'github.com' && /^\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(u.pathname);
  // No fallback from the chosen authentication route.
  return plan.authRoute === 'ssh' ? u.protocol === 'ssh:' : u.protocol === 'https:';
 } catch {return false;}
}
export class PublicationController {
 private state: PublicationState = {busy: false, plan: null, confirmed: false, outcome: null, error: false};
 private listeners = new Set<() => void>(); private generation = 0; private dirty = 0; private uncertainRemote: string | null = null; private reviewedRemote = '';
 constructor(private backend: PublicationBackend) {}
 getState = () => this.state;
 subscribe = (fn: () => void) => {this.listeners.add(fn); return () => {this.listeners.delete(fn);};};
 private update(patch: Partial<PublicationState>) {this.state = {...this.state, ...patch}; this.listeners.forEach(fn => fn());}
 /** Buffer edits revoke confirmation. Agent writes are blocked even if the host's report is stale. */
 setUnsaved(count: number) {if(this.dirty !== count) {this.dirty = count; this.update({confirmed: false});}}
 invalidate() {this.generation++; this.update({busy: false, plan: null, confirmed: false, outcome: this.uncertainRemote ? {kind: 'uncertain-reconcile'} : {kind: 'stale-plan'}});}
 confirm(value: boolean) {this.update({confirmed: value && !!this.state.plan && !this.state.busy});}
 canApply() {
  const {plan, busy, confirmed, outcome} = this.state;
  return !!plan && !busy && confirmed && !outcome && safeDestination(plan) && plan.commits.length > 0 &&
   (plan.initiatedBy === 'human' || (!!plan.grant?.id && this.dirty === 0 && plan.unsavedBuffers === 0));
 }
 async review(target: PublicationTarget, refetch = false) {
  if(this.state.busy || (this.state.outcome?.kind === 'uncertain-reconcile' || this.state.outcome?.kind === 'stale-plan') && !refetch) return;
  const generation = ++this.generation;
  this.update({busy: true, plan: null, confirmed: false, error: false});
  try {
   if(refetch) await this.backend.fetch(this.uncertainRemote ?? target.remote);
   const plan = await this.backend.plan(target);
   if(generation !== this.generation) return;
   if(!safeDestination(plan) || plan.account.id !== target.accountId || plan.authRoute !== target.authRoute || plan.sourceBranch !== target.sourceBranch || plan.targetBranch !== target.targetBranch) throw new Error('invalid-plan');
   this.reviewedRemote = target.remote; this.uncertainRemote = null; this.update({plan, outcome: null});
  } catch {if(generation === this.generation) this.update({error: true});}
  finally {if(generation === this.generation) this.update({busy: false});}
 }
 async publish() {
  if(!this.canApply()) return;
  const plan = this.state.plan!;
  this.update({busy: true, confirmed: false, error: false});
  try {
   const outcome = await this.backend.apply({planId: plan.planId, contentHash: plan.contentHash, confirmed: true});
   // Single-use approval, even for denied, stale or uncertain outcomes. Never auto-retry.
   if(outcome.kind === 'uncertain-reconcile') this.uncertainRemote = this.reviewedRemote;
   this.update({plan: null, outcome});
  } catch {this.uncertainRemote = this.reviewedRemote; this.update({plan: null, outcome: {kind: 'uncertain-reconcile'}});}
  finally {this.update({busy: false});}
 }
}
