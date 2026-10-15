import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addSessionGrant,clearSessionGrants,hasSessionGrant,listSessionGrants,revokeSessionGrant,subscribeSessionGrants} from './sessionGrants';

test('session grants: add, list, revoke, clear',()=>{
 assert.deepEqual(listSessionGrants(),[]);
 addSessionGrant('/a.ts','read',1000);
 assert.deepEqual(listSessionGrants(),[{path:'/a.ts',actions:['read'],grantedAt:1000}]);
 assert.ok(hasSessionGrant('/a.ts','read'));
 assert.ok(!hasSessionGrant('/a.ts','write'));
 addSessionGrant('/a.ts','write',2000); // a write grant implies read on the same path
 assert.deepEqual(listSessionGrants(),[{path:'/a.ts',actions:['read','write'],grantedAt:2000}]); // re-grant refreshes the timestamp
 assert.ok(revokeSessionGrant('/a.ts'));
 assert.ok(!revokeSessionGrant('/a.ts'),'revoking twice reports false');
 assert.deepEqual(listSessionGrants(),[]);
 addSessionGrant('/b.ts','write');
 clearSessionGrants();
 assert.deepEqual(listSessionGrants(),[]);
});

test('session grants: subscribers notified on change, not on empty clear',()=>{
 let n=0;
 const off=subscribeSessionGrants(()=>{n++;});
 addSessionGrant('/c.ts','read');
 revokeSessionGrant('/c.ts');
 clearSessionGrants(); // already empty: no notify
 off();
 assert.equal(n,2);
});
