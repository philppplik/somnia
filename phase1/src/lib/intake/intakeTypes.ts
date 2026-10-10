/**
 * Single-instance native intake, frontend contracts (12.0.1, work package D2-E).
 *
 * Shared wire DTOs (summaries, claimed items, outcomes, retry tokens, policy)
 * live in `src/lib/commandContracts.ts` (S2, typed command boundary) and are
 * re-exported here so intake code has one import surface. This module adds the
 * orchestrator-side types the boundary does not own: the final
 * IntakeOperationNotice, the UI-only context rows and the retry executor
 * contract.
 *
 * No paths, argv or file bytes ever appear in log/notice metadata: the
 * basename is UI-only and reaches the notice layer exclusively through
 * `registerIntakeContext`.
 */
import type {OpenRequestSummary} from '../commandContracts';

export type {ClaimedItem,ClaimReply,GrantRead,ItemOutcome,ItemOutcomeStatus,OpenRequestItemSummary,OpenRequestSummary,RetryToken,AckReply,IntakePolicy} from '../commandContracts';

/** Host-assigned request identity (ULID). Equals the diagnostics correlation id (`corr`). */
export type RequestId=string;
/** One-shot read grant issued by the host at claim time. Never reused. */
export type GrantId=string;
/** Incident id assigned by the diagnostics logger (D1). Empty string on the wire means none. */
export type IncidentId=string;

export type OpenSource='ColdArgv'|'SecondInstance'|'OsOpen';

/**
 * Drain rows as the orchestrator consumes them: S2's OpenRequestSummary plus
 * the optional host reset counter behind APP-012 ("Opening was restarted
 * after reload" is shown only when resetCount>0 and items were affected).
 */
export interface OpenRequestSummaryView extends OpenRequestSummary{resetCount?:number}

/**
 * Ack retry token as D3 needs it (clarification after D2 final, S2-0003): the
 * host is authoritative on TTL/single-use (60s) and supplies the absolute
 * expiry as epoch milliseconds. Without `expiresAt` the renderer offers NO
 * retry action in v1 - it never computes TTL from receipt time because
 * transport lag could sell an expired token.
 */
export interface IntakeRetryToken{ordinal:number;token:string;/** Absolute expiry, epoch ms (host-minted). */expiresAt?:number}

/** UI-only context row for the D3 noticeStore correlation map (corr -> ordinal -> UiOnlyContext). */
export interface IntakeContextItem{ordinal:number;displayName?:string}

/** Per-item verdict inside the single final notice of a request. No basenames here. */
export interface IntakeOperationNoticeItem{ordinal:number;status:import('../commandContracts').ItemOutcomeStatus;cause?:string;incidentId?:IncidentId}
export interface IntakeOperationCounts{opened:number;failed:number;cancelled:number;deferred:number;activatedExisting:number;rejected:number}
/**
 * Exactly ONE final IntakeOperationNotice per request, keyed corr=OpenRequest.id.
 * Basenames are never part of this object; the presenter enriches cards from
 * the UI-only correlation map. Pure-success reports follow the D3 quiet rule:
 * the presenter decides rendering, the orchestrator always emits exactly one
 * complete report.
 */
export interface IntakeOperationNotice{corr:RequestId;source:OpenSource;resetCount:number;items:IntakeOperationNoticeItem[];counts:IntakeOperationCounts}

/** Result of one retry execution (D3 status union, retryActions.ts). */
export type IntakeRetryStatus='opened'|'rejected'|'failed'|'cancelled'|'expired';
export type IntakeRetryRun=(requestId:RequestId,ordinal:number,token:string)=>Promise<IntakeRetryStatus>;
