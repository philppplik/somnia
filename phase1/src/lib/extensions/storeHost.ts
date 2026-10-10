import type {ReleaseEvidence,SecurityFeed,StoreCatalog} from './store';
import type {ConsentReviewRequest} from './consentUiHost';

/** One verified snapshot. `catalog` and `feed` must come from the signed delivery adapter, never from raw JSON. */
export interface StoreSnapshot {catalog:StoreCatalog; feed:SecurityFeed; fetchedAt:string|null; offline:boolean; /** Epoch ms of the last verified refresh, null when unknown. */ lastTrustedCheck:number|null}
export type StoreLoad={status:'ready'; snapshot:StoreSnapshot}|{status:'unavailable'};
export type StageErrorCode='blocked'|'stale'|'incompatible'|'mismatch'|'failed';
/** The staging controller (Store catalog branch) owns bytes, integrity and the atomic swap. The UI only hands the result to the consent UI. */
export type StageResult={kind:'staged'; request:Pick<ConsentReviewRequest,'candidate'|'revalidate'|'commit'>}|{kind:'error'; code:StageErrorCode};
export type ConcernCategory='security'|'impersonation'|'misleading'|'other';
export interface ConcernReport {extensionId:string; version:string; artifactSha256:string; somniaVersion:string; category:ConcernCategory; text:string; errorLog?:string}
/** Store-specific host surface, added to ExtensionsPopupHost as `store`. None of these are exposed to extension RPC. */
export interface StoreHost {
  load(signal?:AbortSignal):Promise<StoreLoad>;
  /** Evidence for exactly this release, or null when none is published. Never inferred. */
  evidence(extensionId:string,version:string):Promise<ReleaseEvidence|null>;
  stage(extensionId:string,version:string,artifactSha256:string,mode:'install'|'update'):Promise<StageResult>;
  /** Local extension error log for the optional report attachment preview, or null when empty. */
  errorLog(extensionId:string):Promise<string|null>;
  somniaVersion():string;
  /** Private route registered for security reports. Resolves with the reference shown to the user. */
  submitReport(report:ConcernReport):Promise<{reference:string}>;
  /** Public index repository issue form URL, https only. Sends nothing by itself. */
  publicIssueUrl(extensionId:string,version:string):string;
  now?():number;
}
