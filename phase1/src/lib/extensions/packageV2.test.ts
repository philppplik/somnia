import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {stringify} from 'smol-toml';
import example from './contracts/v2/example.json';
import {parsePackageFilesV2,parsePackageZipV2} from './packageV2';
const files=():Record<string,Uint8Array>=>({'somnia-extension.toml':strToU8(stringify(example)),'dist/extension.js':strToU8('export function activate() {}'),'panels/summary.json':strToU8('{"type":"text","text":"Summary"}')});
const reject=(f:Record<string,Uint8Array>,code:string)=>{const r=parsePackageFilesV2(f); assert.equal(r.ok,false); if(!r.ok) assert(r.errors.some(e=>e.code===code),JSON.stringify(r.errors));};
test('root TOML .somniax archive and verified inventory validate',()=>{
 const r=parsePackageZipV2(zipSync(files())); assert.equal(r.ok,true); if(r.ok) assert.equal(r.package.manifest.id,example.id);
});
test('verified inventory is copied away from caller buffers',()=>{
 const f=files(); const r=parsePackageFilesV2(f); assert.equal(r.ok,true); if(r.ok) {f['dist/extension.js'][0]=0; assert.notEqual(r.package.files['dist/extension.js'][0],0);}
});
test('missing references report the manifest pointer',()=>{
 const f=files(); delete f['dist/extension.js']; const r=parsePackageFilesV2(f); assert.equal(r.ok,false); if(!r.ok) assert(r.errors.some(e=>e.path==='/runtime/entry'&&e.code==='SOM-EXT-006'));
});
test('manifest is root-only and TOML-only',()=>{
 const f=files(); delete f['somnia-extension.toml']; f['somnia-extension.json']=strToU8(JSON.stringify(example)); reject(f,'SOM-EXT-006');
 const wrapped=Object.fromEntries(Object.entries(files()).map(([k,v])=>['folder/'+k,v])); reject(wrapped,'SOM-EXT-006');
 const double=files(); double['other/somnia-extension.toml']=double['somnia-extension.toml']; reject(double,'SOM-EXT-006');
});
test('unsafe, colliding, nested archive and native files fail closed',()=>{
 for(const path of ['../escape','/absolute','NUL','dist\\bad.js']) {const f=files(); f[path]=new Uint8Array(); reject(f,'SOM-EXT-005');}
 const collision=files(); collision['DIST/extension.js']=new Uint8Array(); reject(collision,'SOM-EXT-005');
 for(const path of ['nested.somniax','nested.zip','code.dll','code.cwasm']) {const f=files(); f[path]=new Uint8Array(); reject(f,'SOM-EXT-008');}
});
test('individual asset budgets are enforced',()=>{const f=files(); f['panels/summary.json']=new Uint8Array(262145); reject(f,'SOM-EXT-007');});
test('archive preflight rejects traversal and duplicate central names',()=>{
 assert.equal(parsePackageZipV2(zipSync({'../escape':strToU8('x')})).ok,false);
 const bytes=zipSync({'a':strToU8('a'),'b':strToU8('b')});
 for(let i=0;i<bytes.length-46;i++) if(bytes[i]===0x50&&bytes[i+1]===0x4b&&bytes[i+2]===1&&bytes[i+3]===2) bytes[i+46]=97;
 assert.equal(parsePackageZipV2(bytes).ok,false);
});
test('archive preflight rejects symlinks, execute bits, encrypted and ZIP64 entries',()=>{
 for(const mut of ['symlink','execute','encrypted','zip64']) {
  const bytes=zipSync(files()); const v=new DataView(bytes.buffer); let p=0; while(v.getUint32(p,true)!==0x02014b50)p++;
  if(mut==='symlink')v.setUint32(p+38,0xa1ff<<16,true);
  if(mut==='execute')v.setUint32(p+38,0x81ed<<16,true);
  if(mut==='encrypted')v.setUint16(p+8,1,true);
  if(mut==='zip64')v.setUint32(p+24,0xffffffff,true);
  assert.equal(parsePackageZipV2(bytes).ok,false,mut);
 }
});
test('archive preflight rejects central/local mismatch and corruption',()=>{
 const b=zipSync(files(),{level:0}); const v=new DataView(b.buffer); b[30]^=1; assert.equal(parsePackageZipV2(b).ok,false);
 const bytes=zipSync(files(),{level:0}); const view=new DataView(bytes.buffer); const start=30+view.getUint16(26,true)+view.getUint16(28,true); bytes[start]^=1; assert.equal(parsePackageZipV2(bytes).ok,false);
 assert.equal(parsePackageZipV2(new Uint8Array([1,2,3])).ok,false); void v;
});
test('archive budget is rejected before expansion allocation',()=>{
 const b=zipSync(files()); const v=new DataView(b.buffer); let p=0; while(v.getUint32(p,true)!==0x02014b50)p++; v.setUint32(p+24,101*1024*1024,true);
 assert.equal(parsePackageZipV2(b).ok,false);
});
test('hidden archive magic and file/directory conflicts are rejected',()=>{
 const f=files(); f['harmless.txt']=new Uint8Array([0x50,0x4b,3,4]); reject(f,'SOM-EXT-008');
 const conflict=files(); conflict['dist']=strToU8('file'); reject(conflict,'SOM-EXT-005');
});
