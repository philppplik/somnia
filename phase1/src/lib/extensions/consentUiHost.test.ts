import test from 'node:test';
import assert from 'node:assert/strict';
import example from './contracts/v2/example.json';
import {CONSENT_REVIEW,requestConsentReview,requestInstallConsent,type ConsentCandidate,type ConsentReviewRequest} from './consentUiHost';
import {createDefaultHost} from './popupHostDefault';
import {configureConsentBroker} from './consentUiHost';
import {PermissionBroker} from './permissionBroker';
import {loadExtensions,enabledIds} from './registry';
import type {ManifestV2} from './manifestV2';
const events=new EventTarget();Object.assign(globalThis,{window:events});
const values=new Map<string,string>();Object.assign(globalThis,{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>values.delete(k)}});
const candidate=():ConsentCandidate=>({manifest:structuredClone(example) as ManifestV2,artifactHash:'a'.repeat(64),manifestHash:'b'.repeat(64),validation:'valid',source:'manual'});
test('absent shell fails rather than waiting forever',async()=>{
 assert.throws(()=>requestConsentReview({candidate:candidate(),revalidate:async()=>candidate(),commit:async()=>{}}),/E_CONSENT_HOST_UNAVAILABLE/);
 await assert.rejects(requestInstallConsent(candidate(),{revalidate:async()=>candidate(),commit:async()=>{}}),/E_CONSENT_HOST_UNAVAILABLE/);
});
test('receipt is not approval; transaction completion settles install, cancellation rejects',async()=>{
 let review!:ConsentReviewRequest;const receive=(event:Event)=>{event.preventDefault();review=(event as CustomEvent<ConsentReviewRequest>).detail;};events.addEventListener(CONSENT_REVIEW,receive);
 try{let settled=false;const install=requestInstallConsent(candidate(),{revalidate:async()=>candidate(),commit:async(_c,approve)=>{await approve();}}).then(()=>{settled=true;});await Promise.resolve();assert.equal(settled,false);await review.commit(review.candidate,async()=>{});await install;review.onClose?.();assert.equal(settled,true);
 const cancelled=requestInstallConsent(candidate(),{revalidate:async()=>candidate(),commit:async()=>{}});review.onClose?.();await assert.rejects(cancelled,/E_CONSENT_CANCELLED/);
 }finally{events.removeEventListener(CONSENT_REVIEW,receive);}
});
test('legacy paste does not install before consent, cancel writes nothing, approved install stays disabled',async()=>{
 values.clear();const broker=new PermissionBroker(localStorage,{invalidate(){}});configureConsentBroker(broker);broker.acknowledgeFirstRun();const host=createDefaultHost();
 const raw=JSON.stringify({id:'acme.legacy',name:'Legacy',version:'1.0.0',apiVersion:1,permissions:['project.read'],contributes:{}});
 let review!:ConsentReviewRequest;const receive=(event:Event)=>{event.preventDefault();review=(event as CustomEvent<ConsentReviewRequest>).detail;};events.addEventListener(CONSENT_REVIEW,receive);
 try{assert.equal((await host.inspect({manifestText:raw})).kind,'ready');const cancelled=host.install('acme.legacy');await new Promise(r=>setImmediate(r));assert.equal(loadExtensions().length,0);review.onClose?.();await assert.rejects(cancelled,/E_CONSENT_CANCELLED/);assert.equal(loadExtensions().length,0);
 const approved=host.install('acme.legacy');await new Promise(r=>setImmediate(r));const current=await review.revalidate();await review.commit(current,()=>broker.approve(current.manifest,current.source));await approved;assert.equal(loadExtensions().length,1);assert.deepEqual(enabledIds(),[]);assert.equal(broker.snapshot().extensions['acme.legacy'].enabled,false);await host.setEnabled('acme.legacy',true);assert.deepEqual(enabledIds(),['acme.legacy']);await broker.setBlocked('acme.legacy','unsafe');await assert.rejects(()=>host.setEnabled('acme.legacy',true),/E_BLOCKLISTED/);
 }finally{events.removeEventListener(CONSENT_REVIEW,receive);}
});
