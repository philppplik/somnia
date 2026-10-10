import type { ErrorId } from '../../generated/errorIds';
import type { IncidentId, RequestId, ReportedFailure, SafeLogEvent, BuildIdentity } from './ids';
export type { ErrorId, IncidentId, RequestId, ReportedFailure, SafeLogEvent, BuildIdentity };
export interface UiOnlyContext { displayName?: string; operation?: 'open' | 'save' | 'backup' | 'restore' | 'export' }
export interface IntakeContextItem { ordinal: number; displayName?: string }
export interface IntakeItemNotice extends IntakeContextItem { status: 'opened' | 'rejected' | 'failed' | 'deferred'; reasonKey?: string; errorId?: ErrorId; incidentId?: IncidentId }
export interface IntakeOperationNotice { kind: 'operation'; corr: RequestId; opened: number; rejected: number; failed: number; deferred: number; items: readonly IntakeItemNotice[]; resetCount?: number; affectedItems?: number }
export type RecoveryImpact = { kind: 'unknown' | 'memoryOnly' | 'saveFailed' } | { kind: 'unchanged' | 'rollbackVerified'; verifiedRevision: string } | { kind: 'draftVerified'; savedAt: string; scope: 'code-text'; verifiedAt: string };
export interface ErrorNotice { kind: 'error'; noticeId: string; failure: ReportedFailure; display?: UiOnlyContext; impact: RecoveryImpact; acknowledged: boolean }
export interface OperationNotice extends IntakeOperationNotice { noticeId: string; acknowledged: boolean }
export type Notice = ErrorNotice | OperationNotice;
export type { DiagnosticsSelection, DiagnosticFilePreview, DiagnosticSnapshot, SaveOutcome, CrashMeta } from '../commandContracts';
export interface DiagnosticsIntent { tab?: 'report' | 'zip' | 'incidents'; incidentId?: string }
export type { RecoveryEvidence } from './ids';
