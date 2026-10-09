import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveOpen,looksLikeText} from './openResolver';
import {registerStudio,getStudio} from './registry';
import {registerOpenHandler,readyHandlersFor} from './openHandlers';
import {codeStudio} from './index';
const enc=(s:string)=>new TextEncoder().encode(s);
const PNG=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
const JPEG=Uint8Array.from([0xff,0xd8,0xff,0xe0,0,0x10,0x4a,0x46,0x49,0x46,0,1]);
const PDF=enc('%PDF-1.7\n%âãÏÓ\n');
const WAV=(()=>{const b=new Uint8Array(16);b.set(enc('RIFF'),0);b.set(enc('WAVE'),8);return b;})();
const studioOf=(name:string,bytes:Uint8Array,opts={})=>{const r=resolveOpen(name,bytes,opts);return r.status==='ready'?r.studioId:r.status;};
test('every shipped Studio is reached from its validated content, whichever Studio is active',()=>{
 const docx=readFileSync('test/documents/sample.docx',{flag:'r'});
 assert.equal(studioOf('a.docx',docx),'documents');
 assert.equal(studioOf('s.xlsx',readFileSync('sheets-craft/fixtures/fixture.xlsx')),'sheets');
 assert.equal(studioOf('a.pptx',readFileSync('slides-engine/fixtures/independent.pptx')),'slides');
 assert.equal(studioOf('clip.wav',WAV),'sound');
 assert.equal(studioOf('index.html',enc('<p>hi</p>')),'code');
 assert.equal(studioOf('notes.md',enc('# hi')),'code');
 assert.equal(studioOf('pic.png',PNG),'photos');
 assert.equal(studioOf('doc.pdf',PDF),'code');
});
test('content wins over suffix: renamed audio is audio, a JPEG named .docx asks instead of silently opening or converting',()=>{
 assert.equal(studioOf('noext',WAV),'sound');
 const r=resolveOpen('draft.docx',JPEG);assert.equal(r.status,'choose-handler');assert.match((r as {reason:string}).reason,/not docx/);
 assert.equal(resolveOpen('draft.docx',JPEG,{target:'code'}).status,'ready');
});
test('corrupt Office package is invalid, never a text buffer of ZIP bytes',()=>{
 const zipish=Uint8Array.from([0x50,0x4b,3,4,...new Array(40).fill(1)]);
 assert.equal(resolveOpen('x.docx',zipish).status,'invalid');
 assert.equal(resolveOpen('x.xlsx',enc('plain text')).status,'invalid');
 assert.equal(resolveOpen('x.png',enc('plain text')).status,'invalid');
});
test('unknown binary stays unopened; unknown verified text is only offered for Code',()=>{
 const bin=Uint8Array.from([1,2,3,0,5,6,7,0,0,0,9,9,9,9]);
 assert.equal(resolveOpen('thing.bin',bin).status,'unsupported');
 assert.equal(resolveOpen('archive.zip',Uint8Array.from([0x50,0x4b,3,4,0,0,0,0])).status,'unsupported');
 const offer=resolveOpen('notes.weird',enc('just words'));assert.equal(offer.status,'safe-text-offer');
 assert.equal(resolveOpen('notes.weird',enc('just words'),{acceptTextOffer:true}).status,'ready');
 assert.equal(looksLikeText(bin),false);assert.equal(looksLikeText(Uint8Array.from([0xff,0xfe,0x41,0])),true);
});
test('oversized text is unsupported',()=>{assert.equal(resolveOpen('big.txt',new Uint8Array(2_000_001).fill(65)).status,'unsupported');});
test('svg: Vector Studio when registered and the SVG is strict-importable; Code otherwise or when overridden',()=>{
 const svg=enc('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
 assert.equal(readyHandlersFor('svg').some(h=>h.studioId==='vector'),true,'vector studio is registered in the app registry');
 assert.equal(studioOf('a.svg',svg),'vector');assert.equal(studioOf('a.svg',svg,{target:'code'}),'code');assert.equal(studioOf('a.svg',svg,{preferred:'code'}),'code','per-document override');
 assert.equal(studioOf('a.html',enc('<p/>'),{preferred:'vector'}),'code','incompatible override ignored');
 assert.equal(studioOf('a.svg',enc('not really svg'),{}),'code','svg suffix without svg content is plain text');
});
test('equal-priority ready handlers ask instead of depending on registration order; a default breaks the tie',()=>{
 const a=registerStudio({...codeStudio,id:'t.a',order:80}),b=registerStudio({...codeStudio,id:'t.b',order:81});
 const ha=registerOpenHandler({id:'t.ha',studioId:'t.a',kinds:['audio'],priority:100,capability:'edit'});
 const hb=registerOpenHandler({id:'t.hb',studioId:'t.b',kinds:['audio'],priority:100,capability:'edit'});
 try{assert.equal(resolveOpen('c.wav',WAV).status,'choose-handler');}finally{ha();hb();a();b();}
 const hd=registerOpenHandler({id:'t.hd',studioId:'sound',kinds:['audio'],priority:100,capability:'edit',isDefault:true});
 try{assert.equal(studioOf('c.wav',WAV),'sound');}finally{hd();}
 assert.throws(()=>getStudio('t.a'));
});
