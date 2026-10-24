import {test} from 'node:test';
import assert from 'node:assert/strict';
import {msixIdentityVersion} from './msix-version.mjs';

const parts=(v)=>v.split('.').map(Number);
const gt=(a,b)=>{const x=parts(a),y=parts(b);for(let i=0;i<4;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;};

test('stable maps to revision 1000',()=>{
  assert.equal(msixIdentityVersion('12.3.0'),'12.3.0.1000');
  assert.equal(msixIdentityVersion('11.1.0'),'11.1.0.1000');
});

test('prerelease maps to its number, clamped to 1..999',()=>{
  assert.equal(msixIdentityVersion('12.3.0-beta.2'),'12.3.0.2');
  assert.equal(msixIdentityVersion('12.3.0-beta.999'),'12.3.0.999');
  assert.equal(msixIdentityVersion('12.3.0-beta.1001'),'12.3.0.999');
  assert.equal(msixIdentityVersion('12.3.0-rc.1'),'12.3.0.1');
  assert.equal(msixIdentityVersion('12.3.0-alpha'),'12.3.0.1');
});

test('unparseable release strings fall back to the dev identity',()=>{
  assert.equal(msixIdentityVersion('garbage'),'0.1.0.0');
  assert.equal(msixIdentityVersion('12.3'),'0.1.0.0');
  assert.equal(msixIdentityVersion(''),'0.1.0.0');
  assert.equal(msixIdentityVersion(undefined),'0.1.0.0');
});

test('ordering: betas climb monotonically and stable always upgrades them',()=>{
  assert(gt(msixIdentityVersion('12.3.0-beta.2'),msixIdentityVersion('12.3.0-beta.1')));
  assert(gt(msixIdentityVersion('12.3.0'),msixIdentityVersion('12.3.0-beta.999')));
  assert(gt(msixIdentityVersion('12.3.0-beta.1'),'11.1.0.1000'));
  assert(gt(msixIdentityVersion('12.3.0-beta.2'),'11.1.0.0')); // published Store package 11.1.0.0
  assert(gt(msixIdentityVersion('12.3.0'),'11.1.0.0'));
});
