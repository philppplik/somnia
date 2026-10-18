import test,{afterEach} from 'node:test';import assert from 'node:assert/strict';
import {connectSessionSafetyToLifecycle,RECOVERY_LIFECYCLE_STUDIOS} from './lifecycleWiring';
import {getRegisteredLifecycleAdapter} from '../lifecycle/adapters';
import {checksumParts} from '../lifecycle/checksum';
import {getLifecycleHost} from './lifecycleBridge';

let off:(()=>void)|null=null;
afterEach(()=>{off?.();off=null;});

test('connect installs the real host and registers documents and sheets',()=>{
 off=connectSessionSafetyToLifecycle();
 assert.equal(getLifecycleHost().checksum(['a',1]),checksumParts(['a',1]));
 for(const id of RECOVERY_LIFECYCLE_STUDIOS)assert.ok(getRegisteredLifecycleAdapter(id));
});
test('disposer unregisters adapters and restores the no-op host',()=>{
 connectSessionSafetyToLifecycle()();
 for(const id of RECOVERY_LIFECYCLE_STUDIOS)assert.equal(getRegisteredLifecycleAdapter(id),undefined);
 assert.equal(getLifecycleHost().registerAdapter('x',{})(),undefined);
});
test('can reconnect after dispose (HMR)',()=>{
 connectSessionSafetyToLifecycle()();
 off=connectSessionSafetyToLifecycle();
 assert.ok(getRegisteredLifecycleAdapter('documents'));
});
