import test from 'node:test';import assert from 'node:assert/strict';
import {checkDocsUrl,resolveDocsLinks,validateDocsLinks,SHELL_DOCS_HOSTS} from './docsLinks';
test('allows https on an allowlisted host',()=>{
 const r=checkDocsUrl('https://github.com/philppplik/somnia/blob/main/docs/ANDROID.md');assert.equal(r.ok,true);
});
test('fails closed',()=>{
 const bad:[unknown,string][]=[
  ['http://github.com/x','not-https'],['javascript:alert(1)','not-https'],['file:///etc/passwd','not-https'],
  ['https://evil.com/x','host-not-allowed'],['https://github.com.evil.com/x','host-not-allowed'],['https://docs.github.com/x','host-not-allowed'],
  ['https://user:pw@github.com/x','credentials'],['https://github.com:8443/x','bad-port'],
  ['not a url','invalid-url'],['','invalid-url'],[42,'invalid-url'],[null,'invalid-url'],['https://github.com/a b','invalid-url'],['https://github.com/\n','invalid-url']];
 for(const [u,why] of bad){const r=checkDocsUrl(u);assert.equal(r.ok,false,String(u));if(!r.ok)assert.equal(r.reason,why,String(u));}
});
test('host match is exact and case-insensitive',()=>{
 assert.equal(checkDocsUrl('https://GitHub.com/x').ok,true);
 assert.equal(checkDocsUrl('https://a.example/x',['a.example']).ok,true);
 assert.equal(checkDocsUrl('https://b.a.example/x',['a.example']).ok,false);
});
test('resolve drops invalid and duplicate entries, keeps order',()=>{
 const out=resolveDocsLinks([
  {id:'a',url:'https://github.com/a',labelKey:'k.a'},{id:'bad',url:'http://github.com/b',labelKey:'k.b'},
  {id:'a',url:'https://github.com/dup',labelKey:'k.a2'},{id:'c',url:'https://github.com/c',labelKey:'k.c'}]);
 assert.deepEqual(out.map(l=>l.id),['a','c']);assert.equal(out[0].url,'https://github.com/a');
 assert.deepEqual(resolveDocsLinks(undefined),[]);
});
test('validate reports each problem',()=>{
 const e=validateDocsLinks([{id:'x',url:'https://evil.com',labelKey:''},{id:'x',url:'https://github.com/x',labelKey:'k'}]);
 assert.equal(e.length,3);assert.ok(e.some(s=>s.includes('host-not-allowed')));assert.ok(e.some(s=>s.includes('duplicate')));assert.ok(e.some(s=>s.includes('labelKey')));
});
test('allowlist is frozen',()=>{assert.throws(()=>{(SHELL_DOCS_HOSTS as string[]).push('evil.com');});});
