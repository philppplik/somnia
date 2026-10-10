import {PermissionBroker,type PermissionHooks} from './permissionBroker';
import type {ManifestV2} from './manifestV2';

/** Host-only UI bridge. Never register these functions with extension RPC. */
export const CONSENT_CHANGED='somnia:extension-consent-changed';
export const CONSENT_REVIEW='somnia:extension-consent-review';
export const CONSENT_BLOCKED='somnia:extension-consent-blocked';
export function consentChanged():void {
  window.dispatchEvent(new Event(CONSENT_CHANGED));
  window.dispatchEvent(new Event('somnia:extensions-changed'));
  window.dispatchEvent(new Event('somnia:extensions-reload'));
}
let current:PermissionBroker|undefined;
/** Supervisor must configure its own lifecycle hooks before opening any v2 sessions. */
export function configureConsentBroker(broker:PermissionBroker):void {current=broker;consentChanged();}
export function getConsentBroker():PermissionBroker {
  return current??=new PermissionBroker(localStorage,{
    invalidate:()=>consentChanged(),
    notify:message=>{window.dispatchEvent(new CustomEvent(CONSENT_BLOCKED,{detail:message}));},
  } satisfies PermissionHooks);
}
export interface ConsentCandidate {
  manifest:ManifestV2;
  artifactHash:string;
  manifestHash:string;
  validation:'loading'|'valid'|'invalid';
  validationMessage?:string;
  source:'manual'|'store';
  sourcePath?:string;
  verified?:{label:string;sourceId:string};
  previous?:ManifestV2;
  blockedPrevious?:{reason:string;url?:string};
}
/** Full manifest and byte identities bind the review, including reason-only changes. */
export const candidateIdentity=(c:ConsentCandidate)=>JSON.stringify([c.manifest,c.artifactHash,c.manifestHash,c.source,c.previous,c.blockedPrevious]);
export interface ConsentReviewRequest {
  candidate:ConsentCandidate;
  /** Re-read the staged package and integrity/compatibility result immediately before commit. */
  revalidate:()=>Promise<ConsentCandidate>;
  /** Host transaction: bind bytes, record approval, and atomically swap. Roll back on failure.
   * Calling approval alone is not an installed package. Old version stays running until this transaction. */
  commit:(candidate:ConsentCandidate,approve:()=>Promise<void>)=>Promise<void>;
  onClose?:()=>void;
  onActivity?:(extensionId:string)=>void;
}
/** Called only by the trusted package/store controller after staging a candidate.
 * The mounted shell acknowledges receipt synchronously; never leave an install waiting for absent UI. */
export function requestConsentReview(request:ConsentReviewRequest):void {
  const event=new CustomEvent(CONSENT_REVIEW,{detail:request,cancelable:true});
  window.dispatchEvent(event);
  if(!event.defaultPrevented)throw new Error('E_CONSENT_HOST_UNAVAILABLE');
}
export type InstallConsentHost=Omit<ConsentReviewRequest,'candidate'>;
/** Resolves after the host transaction, not merely after opening a review or recording approval. */
export function requestInstallConsent(candidate:ConsentCandidate,host:InstallConsentHost):Promise<void> {
  return new Promise((resolve,reject)=>{
    let committed=false;
    requestConsentReview({...host,candidate:structuredClone(candidate),
      commit:async(next,approve)=>{await host.commit(next,approve);committed=true;resolve();},
      onClose:()=>{try{host.onClose?.();}finally{if(!committed)reject(new Error('E_CONSENT_CANCELLED'));}},
    });
  });
}
