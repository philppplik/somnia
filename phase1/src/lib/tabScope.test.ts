import test from 'node:test';
import assert from 'node:assert/strict';
import {fileTabStudio,mediaTabStudio,scopedFiles,neighbourAfterClose,cycleScoped} from './tabScope';

const STUDIOS=['code','documents','sheets','slides','sound','photos','video','design','vector','vibespace'];
const by={'a.html':'code','b.svg':'vector','c.svg':'vector','media:p.png':'photos','media:s.pptx':'slides'};

test('unrouted files belong to Code, routed files to their studio',()=>{
 assert.equal(fileTabStudio('x.html',{}),'code');
 assert.equal(fileTabStudio('b.svg',by),'vector');
});
test('a tab opened in one studio never shows in any other studio',()=>{
 const files=['a.html','b.svg','c.svg'];
 for(const owner of STUDIOS)for(const other of STUDIOS){
  if(owner===other)continue;
  const map={'f.txt':owner};
  assert.ok(scopedFiles(['f.txt'],owner,map).includes('f.txt'));
  assert.ok(!scopedFiles(['f.txt'],other,map).includes('f.txt'),`${owner} tab leaked into ${other}`);
 }
 assert.deepEqual(scopedFiles(files,'vector',by),['b.svg','c.svg']);
 assert.deepEqual(scopedFiles(files,'photos',by),[]);
});
test('media tabs: recorded studio wins, then the kind fallback, then Code',()=>{
 assert.equal(mediaTabStudio('p.png',by),'photos');
 assert.equal(mediaTabStudio('q.png',by,()=>'photos'),'photos');
 assert.equal(mediaTabStudio('q.png',by,()=>null),'code');
 assert.equal(mediaTabStudio('s.pptx',by,()=>'documents'),'slides');
});
test('closing picks a neighbour inside the same studio only, and the last tab can be closed',()=>{
 const files=['a.html','b.svg','x.html','c.svg'];
 assert.equal(neighbourAfterClose(files,'c.svg','vector',by),'b.svg');
 assert.equal(neighbourAfterClose(files,'b.svg','vector',by),'c.svg');
 assert.equal(neighbourAfterClose(files,'a.html','code',by),'x.html');
 assert.equal(neighbourAfterClose(['b.svg'],'b.svg','vector',by),null);
 assert.equal(neighbourAfterClose(['a.html','b.svg'],'a.html','code',by),null,'must not jump into the vector tab');
});
test('tab cycling stays inside the studio',()=>{
 const files=['a.html','b.svg','x.html','c.svg'];
 assert.equal(cycleScoped(files,'b.svg','vector',by,1),'c.svg');
 assert.equal(cycleScoped(files,'c.svg','vector',by,1),'b.svg');
 assert.equal(cycleScoped(files,'a.html','code',by,-1),'x.html');
 assert.equal(cycleScoped(['b.svg'],'b.svg','vector',by,1),null);
});

test('release matrix: interleaved tabs retain owner order, neighbours and wrap in all ten studios',()=>{
 const files=STUDIOS.flatMap(s=>[`${s}-a.txt`,`${s}-b.txt`,`${s}-c.txt`]);
 const map=Object.fromEntries(STUDIOS.flatMap(s=>['a','b','c'].map(n=>[`${s}-${n}.txt`,s])));
 // Deliberately interleave tabs instead of grouping them by owner.
 const interleaved=['a','b','c'].flatMap(n=>STUDIOS.map(s=>`${s}-${n}.txt`));
 for(const studio of STUDIOS){
  const own=['a','b','c'].map(n=>`${studio}-${n}.txt`);
  assert.deepEqual(scopedFiles(interleaved,studio,map),own);
  assert.equal(neighbourAfterClose(interleaved,own[1],studio,map),own[0]);
  assert.equal(neighbourAfterClose(interleaved,own[0],studio,map),own[1]);
  assert.equal(cycleScoped(files,own[2],studio,map,1),own[0]);
  assert.equal(cycleScoped(files,own[0],studio,map,-1),own[2]);
  assert.equal(neighbourAfterClose(files.filter(f=>!own.slice(0,2).includes(f)),own[2],studio,map),null);
 }
});

test('media ownership overrides kind-based fallback for every studio and does not call fallback',()=>{
 for(const studio of STUDIOS){
  let fallbackCalls=0;
  assert.equal(mediaTabStudio('shared.pdf',{'media:shared.pdf':studio},()=>{fallbackCalls++;return 'code';}),studio);
  assert.equal(fallbackCalls,0);
 }
});
