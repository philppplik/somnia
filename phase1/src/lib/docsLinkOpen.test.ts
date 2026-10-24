import test from 'node:test';import assert from 'node:assert/strict';
import {openDocsLink} from './docsLinkOpen';
test('opens only checked URLs',async()=>{
 const seen:string[]=[];const open=async(u:string)=>{seen.push(u);};
 assert.equal(await openDocsLink('https://github.com/philppplik/somnia/issues',open),true);
 for(const bad of ['http://github.com/philppplik/somnia','https://evil.com/philppplik/somnia','https://github.com/other/x','javascript:1',undefined])assert.equal(await openDocsLink(bad,open),false,String(bad));
 assert.deepEqual(seen,['https://github.com/philppplik/somnia/issues']);
});
