/** Renderer-safe publication contract. No credentials or raw transport errors cross this seam.
 * Native service owns effective-URL validation, exact-content checks and remote reconciliation.
 * See docs/git/PUBLICATION-REVIEW.md for the wire integration boundary.
 */
export interface PublicationTarget {remote: string; sourceBranch: string; targetBranch: string; accountId: string; authRoute: 'github-https' | 'ssh' | 'gcm'}
export interface PublicationPlan {
 planId: string; contentHash: string; head: string; remoteTip: string | null;
 account: {id: string; login: string}; authRoute: PublicationTarget['authRoute'];
 repository: {name: string; visibility: 'private' | 'public' | 'internal'};
 effectiveRemoteUrl: string; destinationValidated: boolean;
 sourceBranch: string; targetBranch: string;
 commits: {sha: string; subject: string}[];
 untracked: string[]; excluded: string[];
 unsavedBuffers: number;
 initiatedBy: 'human' | 'agent'; grant?: {id: string; label: string};
}
export type PublicationOutcome =
 | {kind: 'published'; sha: string; remote: string; targetBranch: string}
 | {kind: 'stale-plan'}
 | {kind: 'denied-protection' | 'denied-SSO' | 'needs-auth' | 'needs-workflow-scope' | 'failed'}
 | {kind: 'uncertain-reconcile'};
export interface PublicationBackend {
 plan(target: PublicationTarget): Promise<PublicationPlan>;
 apply(request: {planId: string; contentHash: string; confirmed: true}): Promise<PublicationOutcome>;
 /** Must reconcile any uncertain previous write before preparing a new plan. */
 fetch(remote: string): Promise<void>;
}
export type PublicationInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export function createPublicationBackend(invoke: PublicationInvoke): PublicationBackend {
 return {
  plan: request => invoke('git_push_plan', {request}),
  apply: request => invoke('git_push_apply', {request}),
  fetch: remote => invoke('git_fetch', {request: {remote}}),
 };
}
