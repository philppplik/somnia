/** Mirrors vibespace-core/src/wire.rs v1. No provider/SDK responses or credentials. */
export interface ModelRef {provider:string;model:string;locality:'local'|'cloud'}
export interface Usage {inputTokens:number;outputTokens:number;cacheReadTokens:number|null;cacheWriteTokens:number|null;costUsd:number|null;costSource:string|null}
export interface TranscriptMessage {id:string;role:string;text:string;timestampUtc:string}
export interface PendingConsent {requestId:string;action:string;scope:string;reason:string;allowForRun:boolean;/** Policy v2 action kind; absent for file consents. */
kind?:'read'|'write'|'delete'|'shell'|'network'|'mcp'|'desktop'}
export interface CheckpointSummary {checkpointId:string;label:string;createdAtUtc:string;fileCount:number;restorable:boolean}
export interface ReviewFile {path:string;change:string;binary:boolean;beforeText:string|null;afterText:string|null;beforeBytes:number;afterBytes:number;currentText:string|null;currentBytes:number;conflict:boolean}
export interface CheckSummary {name:string;status:string;detail:string|null}
export interface ReviewProjection {revision:string;summary:string;files:ReviewFile[];conflicts:string[];checks:CheckSummary[]}
export interface FailureSummary {code:string;message:string;retryable:boolean}
export interface RunCapabilities {stop:boolean;steer:boolean;pause:boolean;resume:boolean;apply:boolean;restore:boolean}
export interface RunSnapshot {
 runId:string;studioId:string;spaceId:string;
 executionState:'pending'|'claimed'|'running'|'paused'|'stopped'|'done'|'failed'|'crashed';
 reviewState:'none'|'ready'|'applied'|'discarded'|'conflict';
 goal:string;model:ModelRef;lastStep:string|null;startedAtUtc:string|null;finishedAtUtc:string|null;
 elapsedMs:number;usage:Usage|null;messages:TranscriptMessage[];pendingConsents:PendingConsent[];
 checkpoints:CheckpointSummary[];review:ReviewProjection|null;failure:FailureSummary|null;capabilities:RunCapabilities;
}
export interface SnapshotReply {protocolVersion:1;sequence:number;snapshot:RunSnapshot}
export interface VibeEvent {protocolVersion:1;runId:string;sequence:number;timestampUtc:string;kind:'run_snapshot';payload:RunSnapshot}

export interface StudioSummary {studioId:string;spaceId:string;goal:string;model:ModelRef;canStart:boolean;latestRunId:string|null}
export interface SpaceSummary {spaceId:string;name:string;autonomy:'ask_for_writes';scopeLabel:string;studioCount:number}

export interface StartRun {studioId:string;requestId:string;retryOfRunId:string|null}
