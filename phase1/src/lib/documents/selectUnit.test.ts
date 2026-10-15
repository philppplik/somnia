import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unitRange} from './selectUnit';
const pick=(t:string,i:number,u:'word'|'sentence'|'paragraph')=>{const [a,b]=unitRange(t,i,u);return t.slice(a,b);};
test('double click takes the word and the spaces after it',()=>{
 const t='Hello big world.';
 assert.equal(pick(t,1,'word'),'Hello ');assert.equal(pick(t,6,'word'),'big ');assert.equal(pick(t,12,'word'),'world');
 assert.equal(pick(t,5,'word'),' ','a click on the space takes the space');assert.equal(pick(t,15,'word'),'.');
 assert.equal(pick(t,t.length,'word'),'.','a click past the end takes the last unit');
});
test('sentence and paragraph',()=>{
 const t='One two. Three four! Five?';
 assert.equal(pick(t,3,'sentence'),'One two. ');assert.equal(pick(t,12,'sentence'),'Three four! ');assert.equal(pick(t,25,'sentence'),'Five?');
 assert.equal(pick(t,3,'paragraph'),t);
});
test('empty text, emoji and out-of-range indexes are safe',()=>{
 assert.deepEqual(unitRange('',0,'word'),[0,0]);assert.deepEqual(unitRange('',5,'paragraph'),[0,0]);
 assert.equal(pick('a 😀 b',2,'word'),'😀 ');
 assert.equal(pick('abc',-4,'word'),'abc');assert.equal(pick('abc',99,'word'),'abc');
 assert.equal(pick('x'.repeat(5000),100,'word').length,5000);
});
import {PARAGRAPH_SPACINGS} from './protocol';
test('spacing presets are the seven names the engine knows',()=>{assert.deepEqual([...PARAGRAPH_SPACINGS],['default','none','compact','tight','open','relaxed','double']);});
import {coverProblem,MAX_COVER_CHARS} from './protocol';
test('coverProblem needs a title and plain bounded texts',()=>{
 const ok={title:'T',subtitle:'',author:'A',date:'D'};
 assert.equal(coverProblem(ok),null);
 for(const bad of [null,[],{...ok,title:'  '},{...ok,title:'x'.repeat(MAX_COVER_CHARS+1)},{...ok,author:'a\nb'},{...ok,date:5},{title:'T'}])assert.ok(coverProblem(bad));
 assert.equal(coverProblem({...ok,title:'x'.repeat(MAX_COVER_CHARS)}),null);
});
