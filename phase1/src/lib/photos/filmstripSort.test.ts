import test from 'node:test';
import assert from 'node:assert/strict';
import {sortFilmstrip} from './filmstripSort';
const img=(name:string)=>({name,kind:'image',mime:'image/png'});
const items=[img('a.png'),img('b.png'),img('c.png'),img('d.png')];
test('library order is the default and returns the input order',()=>{
 assert.deepEqual(sortFilmstrip(items,'library',{},{}).map(i=>i.name),['a.png','b.png','c.png','d.png']);
});
test('rating sort orders descending, unrated last, library order inside ties',()=>{
 const sorted=sortFilmstrip(items,'rating',{'b.png':5,'d.png':5,'a.png':2},{}).map(i=>i.name);
 assert.deepEqual(sorted,['b.png','d.png','a.png','c.png']);
});
test('flag sort ranks pick before unflagged before reject',()=>{
 const sorted=sortFilmstrip(items,'flag',{},{'c.png':'pick','a.png':'reject','b.png':'pick'}).map(i=>i.name);
 assert.deepEqual(sorted,['b.png','c.png','d.png','a.png']);
});
test('sorting never mutates the input array',()=>{
 const before=[...items];
 sortFilmstrip(items,'rating',{'a.png':5},{});
 assert.deepEqual(items,before);
});
