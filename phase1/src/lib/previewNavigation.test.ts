import {test} from 'node:test';import assert from 'node:assert/strict';
import {newPreviewHistory,resolvePreviewLink,visitPreview} from './previewNavigation';
const files={'index.html':'','pages/a.html':'','pages/b.HTML':'','pages/a b.html':'','outside.txt':''};
test('links resolve against the current file and project root',()=>{
 for(const [href,file] of [['../index.html','index.html'],['b.HTML?x=1','pages/b.HTML'],['/index.html','index.html'],['a%20b.html','pages/a b.html']])assert.deepEqual(resolvePreviewLink(files,'pages/a.html',href),{kind:'local',file,hash:''});
 assert.deepEqual(resolvePreviewLink(files,'pages/a.html','#two'),{kind:'local',file:'pages/a.html',hash:'#two'});
 assert.deepEqual(resolvePreviewLink(files,'pages/a.html','../index.html?x=1#two'),{kind:'local',file:'index.html',hash:'#two'});
});
test('traversal, disk/custom schemes, credentials and missing files fail closed',()=>{
 for(const href of ['../../index.html','../..%2findex.html','%2e%2e/%2e%2e/index.html','%252e%252e/index.html','file:///index.html','C:/index.html','javascript:alert(1)','data:text/html,x','mailto:x@y.z','https://user:pass@example.com','https://example.com\n/','../outside.txt','missing.html','..\\index.html','%5cindex.html','/../index.html'])assert.equal(resolvePreviewLink(files,'pages/a.html',href).kind,'blocked',href);
});
test('only web URLs leave the iframe',()=>{
 assert.deepEqual(resolvePreviewLink(files,'index.html','https://example.com/a'),{kind:'external',url:'https://example.com/a'});
 assert.deepEqual(resolvePreviewLink(files,'index.html','//example.com/a'),{kind:'external',url:'https://example.com/a'});
});
test('history tracks anchors, truncates forward visits, is bounded and ignores duplicate locations',()=>{
 let h=newPreviewHistory('index.html');h=visitPreview(h,{kind:'local',file:'pages/a.html',hash:'#two'});assert.equal(h.index,1);
 assert.equal(visitPreview(h,{kind:'local',file:'pages/a.html',hash:'#two'}),h);
 h={...h,index:0};h=visitPreview(h,{kind:'local',file:'pages/b.HTML',hash:''});assert.equal(h.entries.length,2);assert.equal(h.entries[1].file,'pages/b.HTML');
 for(let i=0;i<200;i++)h=visitPreview(h,{kind:'local',file:'index.html',hash:'#'+i});assert.equal(h.entries.length,100);assert.equal(h.index,99);
});
