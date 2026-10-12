/**
 * WebView mirror of the vibespace-policy trust model (src/mcp.rs, src/trust.rs) for the MCP
 * consent and grant UI. Display and local bookkeeping only: the broker in the Rust crate is
 * the gate; nothing here can allow an effect.
 *
 * Trust is four SEPARATE axes - publisher, review, content digest, runtime permissions.
 * No axis implies another and none of them changes what the broker allows.
 */

export type PublisherTrust = { readonly state: 'unverified' } | { readonly state: 'verified'; readonly keynum: string };
export type ReviewState = 'unreviewed' | 'scanned' | 'verified';
export type RuntimePermission = 'spawn_process' | 'network_egress' | 'read_filesystem' | 'write_filesystem' | 'read_clipboard' | 'write_clipboard';

export interface TrustPosture {
  readonly publisher: PublisherTrust;
  readonly review: ReviewState;
  /** Hex digest pinned at install/consent; empty string = not pinned yet. */
  readonly pinnedDigest: string;
  readonly permissions: readonly RuntimePermission[];
}

/** Every new extension or MCP server starts here: nothing verified, nothing granted. */
export const RESTRICTED_POSTURE: TrustPosture = Object.freeze({
  publisher: Object.freeze({ state: 'unverified' as const }),
  review: 'unreviewed',
  pinnedDigest: '',
  permissions: Object.freeze([]),
});

/** True only when the permission was explicitly granted. Restricted default permits nothing. */
export function permits(posture: TrustPosture, p: RuntimePermission): boolean {
  return posture.permissions.includes(p);
}

/** Grant one permission. Granting one never grants another. */
export function withPermission(posture: TrustPosture, p: RuntimePermission): TrustPosture {
  return permits(posture, p) ? posture : { ...posture, permissions: [...posture.permissions, p] };
}

/** A pin matches only the exact artifact. No pin, or any change, drops derived approvals. */
export function digestIntact(posture: TrustPosture, currentDigest: string): boolean {
  return posture.pinnedDigest !== '' && posture.pinnedDigest === currentDigest;
}

/**
 * Grant types stay separated. A folder grant (file/folder access) never covers an MCP call;
 * an MCP grant covers exactly one server + tool at exactly the schema hash the user approved.
 */
export type FolderGrant = { readonly kind: 'folder'; readonly target: string };
export type McpGrant = { readonly kind: 'mcp'; readonly server: string; readonly tool: string; readonly schemaHash: string };
export type AnyGrant = FolderGrant | McpGrant;

export interface McpCallTarget {
  readonly server: string;
  readonly tool: string;
  readonly schemaHash: string;
}

/** The only rule that may satisfy an MCP call: an exact, digest-bound MCP grant. */
export function grantSatisfiesMcpCall(grant: AnyGrant, call: McpCallTarget): boolean {
  if (grant.kind !== 'mcp') return false;
  return grant.server === call.server && grant.tool === call.tool && grant.schemaHash === call.schemaHash;
}

/** Revocation lists for each store stay separate so the UI cannot mix them. */
export function revokeGrant<G extends AnyGrant>(grants: readonly G[], kind: G['kind'], predicate: (g: G) => boolean): G[] {
  return grants.filter((g) => g.kind !== kind || !predicate(g));
}

/** Skill trust tier -> script behaviour (mirrors skill_script_gate in vibespace-policy). */
export type SkillScriptGate = 'disabled' | 'consent-per-run';
export function skillScriptGate(trust: ReviewState): SkillScriptGate {
  return trust === 'unreviewed' ? 'disabled' : 'consent-per-run';
}

/** The badge shown next to a skill/extension reflects the review axis only. */
export function trustBadge(review: ReviewState): ReviewState {
  return review;
}
