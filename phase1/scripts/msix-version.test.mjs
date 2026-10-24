import {test} from 'node:test';
import assert from 'node:assert/strict';
import {msixIdentityVersion} from './msix-version.mjs';

const parts=(v)=>v.split('.').map(Number);
const gt=(a,b)=>{const x=parts(a),y=parts(b);for(let i=0;i<4;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;};

test('every mapped version ends in .0 and has a non-zero first section (Store schema)',()=>{
  for(const r of ['12.3.0','12.3.0-beta.2','12.3.1-rc.1','12.3.0-alpha','garbage','12.3','']) {
    const v=msixIdentityVersion(r);
    assert.match(v,/^\d+\.\d+\.\d+\.0$/);
    assert.ok(Number(v.split('.')[0])>=1||v==='0.1.0.0'); // 0.1.0.0 is the documented dev fallback, never Store-eligible
  }
});

test('stable maps to its exact x.y.z.0',()=>{
  assert.equal(msixIdentityVersion('12.3.0'),'12.3.0.0');
  assert.equal(msixIdentityVersion('11.1.0'),'11.1.0.0');
});

test('prerelease suffix is stripped: a prerelease submits as its target version',()=>{
  assert.equal(msixIdentityVersion('12.3.0-beta.2'),'12.3.0.0');
  assert.equal(msixIdentityVersion('12.3.1-rc.1'),'12.3.1.0');
  assert.equal(msixIdentityVersion('12.3.0-alpha'),'12.3.0.0');
  assert(gt(msixIdentityVersion('12.3.0-beta.2'),'11.1.0.0')); // above the published Store package
});

test('MSIX_VERSION override wins and is validated',()=>{
  assert.equal(msixIdentityVersion('12.3.0-beta.2','12.3.1.0'),'12.3.1.0');
  assert.throws(()=>msixIdentityVersion('12.3.0','12.3.0.2'),/fourth section/);
  assert.throws(()=>msixIdentityVersion('12.3.0','garbage'),/x\.y\.z\.0/);
});

test('unparseable release strings fall back to the dev identity',()=>{
  assert.equal(msixIdentityVersion('garbage'),'0.1.0.0');
  assert.equal(msixIdentityVersion('12.3'),'0.1.0.0');
  assert.equal(msixIdentityVersion(''),'0.1.0.0');
  assert.equal(msixIdentityVersion(undefined),'0.1.0.0');
});
