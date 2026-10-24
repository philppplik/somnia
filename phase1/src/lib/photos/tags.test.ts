import test from 'node:test';
import assert from 'node:assert/strict';
import {addTags,allTags,getTags,MAX_TAGS_PER_PHOTO,normalizeTags,setTags} from './tags.ts';
test('tags set, merge and clear per photo',()=>{
 assert.deepEqual(getTags('a.png'),[]);
 setTags('a.png',[' Urlaub ','urlaub','strand']);assert.deepEqual(getTags('a.png'),['Urlaub','urlaub','strand']); // trimmed, case-sensitive dedupe
 addTags('a.png',['2026','strand']);assert.deepEqual(getTags('a.png'),['Urlaub','urlaub','strand','2026']); // merge keeps existing
 setTags('a.png',[]);assert.deepEqual(getTags('a.png'),[]);
});
test('tags reject invalid input and cap the count',()=>{
 setTags('b.png',['','   ',null,42,'x'.repeat(100) as string]);assert.deepEqual(getTags('b.png'),[]);
 setTags('', ['tag']);assert.deepEqual(getTags(''),[]);
 assert.equal(normalizeTags(Array.from({length:50},(_,i)=>`t${i}`)).length,MAX_TAGS_PER_PHOTO);
});
test('allTags unions the library sorted',()=>{
 setTags('c1.png',['zeta','alpha']);setTags('c2.png',['alpha','mid']);
 assert.deepEqual(allTags().filter(t=>['alpha','mid','zeta'].includes(t)),['alpha','mid','zeta']);
 setTags('c1.png',[]);setTags('c2.png',[]);
});
