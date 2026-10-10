/**
 * Shared diagnostics types. D1 owns them, other packages import and never redefine them.
 * The types are re-exported from here so there is one import path for the UI side.
 */
import type {ErrorId} from '../../generated/errorIds';
import type {LogLine,SafeLogEvent as SafeLogEventShape,BuildIdentity as BuildIdentityShape} from '../log.types';
export type {ErrorId};
export type IncidentId=string&{readonly __b:'incident'};
export type RequestId=string&{readonly __b:'request'};
export type BuildIdentity=BuildIdentityShape;
export type SafeLogEvent=SafeLogEventShape;
export type {LogLine};
/** What the UI may show about a failure. Carries no free text, no paths and no file names. */
export interface ReportedFailure{
 id:ErrorId;
 /** ULID. Present for every unexpected event that reaches a subscriber (error, fatal, unexpected warn). */
 incidentId:IncidentId;
 expected:boolean;
 level:'warn'|'error';
 fatal:boolean;
 fingerprint:string;
 userMessageKey:string;
 corr?:string;
 ordinal?:number;
}

/** Recovery producer proof only; absence of that producer always stays unknown. */
export type RecoveryEvidence =
 | {kind:'unknown'}
 | {kind:'draft-present';count:number;newestAgeSec:number;verified:boolean}
 | {kind:'incident-scoped';scope:string;checkpointAt:string;session:string;snapshotCorrelated:true};
