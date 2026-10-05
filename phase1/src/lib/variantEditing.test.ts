import test from 'node:test';import assert from 'node:assert/strict';
import * as cs from './componentSystem';
import * as ve from './variantEditing';
let n=0;const id=()=>`id${++n}`;
const btn='<button class="btn btn-primary" id="buy">Buy</button>';
const mk=()=>cs.createComponent([],'Button',btn,id);

test('copyName picks a free name and respects the length limit',()=>{
 assert.equal(ve.copyName(['A'],'A'),'A copy');
 assert.equal(ve.copyName(['A','a copy'],'A'),'A copy 2');
 const long='x'.repeat(60);assert.ok(ve.copyName([long],long).length<=60);
});
test('duplicate puts the copy after the original, same html, new id, input untouched',()=>{
 let l=mk();const cid=l[0].id,v0=l[0].variants[0].id;
 l=cs.addVariant(l,cid,'Outline','<button class="btn">B</button>',id);
 const before=JSON.stringify(l);
 const r=ve.duplicateVariant(l,cid,v0,id);
 assert.equal(JSON.stringify(l),before);
 assert.equal(r[0].variants.length,3);
 assert.equal(r[0].variants[1].name,'Default copy'.replace('Default',l[0].variants[0].name));
 assert.equal(r[0].variants[1].html,l[0].variants[0].html);
 assert.notEqual(r[0].variants[1].id,v0);
 assert.equal(r[0].variants[2].name,'Outline');
});
test('duplicate refuses at the variant limit and for missing ids',()=>{
 let l=mk();const cid=l[0].id;
 for(let i=1;i<cs.LIMITS.variants;i++)l=cs.addVariant(l,cid,'V'+i,btn,id);
 assert.throws(()=>ve.duplicateVariant(l,cid,l[0].variants[0].id,id),/at most/);
 assert.throws(()=>ve.duplicateVariant(l,cid,'nope',id),/no longer exists/);
 assert.throws(()=>ve.duplicateVariant(l,'nope','x',id),/no longer exists/);
});
test('variantHtmlProblem catches empty, huge, repeated ids, non-tag start',()=>{
 assert.match(ve.variantHtmlProblem('  ')!,/empty/);
 assert.match(ve.variantHtmlProblem('<p>'+'x'.repeat(100000)+'</p>')!,/100 KB/);
 assert.match(ve.variantHtmlProblem('<div id="a"><p id="a"></p></div>')!,/repeats an ID/);
 assert.match(ve.variantHtmlProblem('hello')!,/start with an HTML tag/);
 assert.equal(ve.variantHtmlProblem(btn),null);
});
test('saveVariantHtml updates only that variant, strips marks, refuses bad html',()=>{
 let l=mk();const cid=l[0].id,v0=l[0].variants[0].id;
 l=cs.addVariant(l,cid,'Outline','<button class="btn">B</button>',id);
 const r=ve.saveVariantHtml(l,cid,l[0].variants[1].id,cs.markInstance('<button class="x">Z</button>',cid,v0));
 assert.equal(r[0].variants[1].html,'<button class="x">Z</button>');
 assert.equal(r[0].variants[0].html,l[0].variants[0].html);
 assert.throws(()=>ve.saveVariantHtml(l,cid,v0,''),/empty/);
 assert.throws(()=>ve.saveVariantHtml(l,cid,'nope',btn),/no longer exists/);
});
test('isUnchanged ignores marks',()=>{
 const l=mk();const cid=l[0].id,v0=l[0].variants[0].id;
 assert.equal(ve.isUnchanged(l,cid,v0,cs.markInstance(btn,cid,v0)),true);
 assert.equal(ve.isUnchanged(l,cid,v0,btn+' '),false);
});
test('diffVariants: identical, line add/remove, single-line split, cap',()=>{
 const same=ve.diffVariants('<p>a</p>\n<p>b</p>','<p>a</p>\n<p>b</p>');
 assert.ok(same.every(l=>l.kind==='same'));assert.equal(ve.diffSummary(same),'No differences.');
 const d=ve.diffVariants('<div>\n<p>a</p>\n<p>b</p>\n</div>','<div>\n<p>a</p>\n<p>c</p>\n<p>d</p>\n</div>');
 assert.deepEqual(d.filter(l=>l.kind!=='same').map(l=>l.kind+':'+l.text),['removed:<p>b</p>','added:<p>c</p>','added:<p>d</p>']);
 assert.equal(ve.diffSummary(d),'2 lines added, 1 line removed.');
 const long='<ul>'+'<li class="item">entry</li>'.repeat(4)+'</ul>';
 const e=ve.diffVariants(long,long.replace('</ul>','<li>new</li></ul>'));
 assert.equal(e.filter(l=>l.kind==='added').length,2);
 assert.throws(()=>ve.diffVariants('<p>\n'.repeat(5),'<p>',3),/limited/);
});
test('diff ignores data-somnia marks',()=>{
 const d=ve.diffVariants(cs.markInstance(btn,'c','v'),btn);
 assert.ok(d.every(l=>l.kind==='same'));
});
