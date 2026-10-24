import test from 'node:test';
import assert from 'node:assert/strict';
import {photoNav} from './photoNav';
const img=(name:string,mime='image/png')=>({name,kind:'image',mime});
const items=[img('a.png'),{name:'doc.psd',kind:'psd',mime:'image/vnd.adobe.photoshop'},img('b.jpg','image/jpeg'),img('c.webp','image/webp'),img('d.png'),{name:'notes.txt',kind:'file',mime:'text/plain'}];
test('navigates library order among developable images only',()=>{
 const n=photoNav(items,'b.jpg');
 assert.deepEqual(n,{prev:'a.png',next:'d.png',position:2,total:3});
});
test('first and last clamp without wrapping',()=>{
 assert.deepEqual(photoNav(items,'a.png'),{prev:null,next:'b.jpg',position:1,total:3});
 assert.deepEqual(photoNav(items,'d.png'),{prev:'b.jpg',next:null,position:3,total:3});
});
test('unknown or undevelopable current yields null neighbours with the total',()=>{
 assert.deepEqual(photoNav(items,'c.webp'),{prev:null,next:null,position:0,total:3});
 assert.deepEqual(photoNav(items,'missing.png'),{prev:null,next:null,position:0,total:3});
 assert.deepEqual(photoNav([],'a.png'),{prev:null,next:null,position:0,total:0});
});
