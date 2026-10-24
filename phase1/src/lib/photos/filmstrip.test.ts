import test from 'node:test';
import assert from 'node:assert/strict';
import {developablePhotos} from './photoNav';
const img=(name:string,mime='image/png')=>({name,kind:'image',mime});
test('developable photos keep library order and only JPEG/PNG images',()=>{
 const items=[img('a.png'),{name:'doc.psd',kind:'psd',mime:'image/vnd.adobe.photoshop'},img('b.jpg','image/jpeg'),img('c.webp','image/webp'),{name:'notes.txt',kind:'file',mime:'text/plain'},img('d.png')];
 assert.deepEqual(developablePhotos(items).map(i=>i.name),['a.png','b.jpg','d.png']);
});
test('no developable photos yields an empty list',()=>{
 assert.deepEqual(developablePhotos([{name:'doc.psd',kind:'psd',mime:'image/vnd.adobe.photoshop'},{name:'x.webp',kind:'image',mime:'image/webp'}]),[]);
});
test('the generic item shape passes through untouched',()=>{
 const items=[{name:'a.png',kind:'image',mime:'image/png',url:'blob:x',size:7}];
 const out=developablePhotos(items);
 assert.equal(out.length,1);
 assert.equal(out[0].url,'blob:x');
 assert.equal(out[0].size,7);
});
