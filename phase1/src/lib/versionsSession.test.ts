import test from 'node:test';
import assert from 'node:assert/strict';
import {getVersionsSession,setVersionsSession,subscribeVersionsSession,type VersionsSession} from './versionsSession';
const fake=():VersionsSession=>({projectId:'p',port:{invoke:async()=>undefined as never},nextRevision:()=>1,hasUnsavedBuffers:()=>false,settle:async()=>{},applyRecoveryRestore:async()=>{},reloadFromDisk:async()=>({changed:[]})});
test('session registry notifies subscribers and clears',()=>{
 let n=0;const off=subscribeVersionsSession(()=>{n++;});
 const s=fake();setVersionsSession(s);assert.equal(getVersionsSession(),s);
 setVersionsSession(null);assert.equal(getVersionsSession(),null);assert.equal(n,2);
 off();setVersionsSession(s);assert.equal(n,2);setVersionsSession(null);
});
