import type {ActivityFilter,ActivityPage} from './securityActivity';
import type {StoreHost} from './storeHost';
import type {CandidateState,PopupExtension,SourceInfo} from './popupModel';

export interface BrowseEntry {id:string; name:string; description:string; publisher:string; badge:{criterion:string}|null; permissionLabels:string[]; state:'available'|'installed'|'update-consent'; verified:boolean}
export type BrowseResult={status:'ready'; entries:BrowseEntry[]; fetchedAt:string|null; offline:boolean}|{status:'unavailable'};
export interface UpdateDiff {version:string; added:string[]; blocked:boolean}
/**
 * Everything the popup needs from the trusted host. Every mutation resolves only after the host acknowledges it
 * and rejects with an Error whose message is shown once, inline. None of these are exposed to extension RPC.
 */
export interface ExtensionsPopupHost {
  /** Verified Store surface. Absent until the signed catalog adapter is wired; the legacy browse list is used then. */
  store?:StoreHost;
  list():Promise<PopupExtension[]>;
  setEnabled(id:string,on:boolean):Promise<void>;
  disableAll():Promise<void>;
  /** Revokes (on=false) or re-grants the declared scope of one row. Re-grant never accepts a free-form host. */
  setGrant(id:string,rowId:string,on:boolean):Promise<void>;
  remove(id:string,deleteData:boolean):Promise<void>;
  checkUpdate(id:string):Promise<void>;
  reviewUpdate(id:string):Promise<UpdateDiff>;
  acceptUpdate(id:string):Promise<void>;
  keepCurrent(id:string):Promise<void>;
  queryActivity(filter:ActivityFilter,offset:number,limit:number):Promise<ActivityPage>;
  /** Host-owned save dialog; null when the user cancels. */
  exportActivity(filter:ActivityFilter):Promise<string|null>;
  copyText(text:string):Promise<void>;
  openExternal(url:string):Promise<void>;
  inspect(input:{manifestText:string; packageName?:string}):Promise<CandidateState>;
  install(candidateId:string):Promise<void>;
  browse(signal?:AbortSignal):Promise<BrowseResult>;
  reviewInstall(id:string):Promise<CandidateState>;
  developerMode():boolean;
  sourceOf?(id:string):SourceInfo;
}
