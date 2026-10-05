import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strFromU8} from 'fflate';
import {decodeBytes,decodeFileBytes,ensureUtf8Charset} from './textEncoding';
import {projectArchive,singleFileHtml} from './exportProject';
const utf8=(s:string)=>new TextEncoder().encode(s);
test('UTF-8 umlauts decode unchanged',()=>{const d=decodeBytes(utf8('Größe Übung ä ö ü ß € 😀'));assert.equal(d.text,'Größe Übung ä ö ü ß € 😀');assert.equal(d.legacy,false);});
test('UTF-8 BOM is stripped',()=>{const d=decodeBytes(new Uint8Array([0xef,0xbb,0xbf,...utf8('Müll')]));assert.equal(d.text,'Müll');assert.equal(d.bom,true);});
test('windows-1252 bytes decode to umlauts instead of replacement characters',()=>{const d=decodeBytes(new Uint8Array([0x4d,0xfc,0x6c,0x6c,0x20,0xe4,0xf6,0xdf,0x20,0x80]));assert.equal(d.text,'Müll äöß €');assert.equal(d.encoding,'windows-1252');assert.ok(!d.text.includes('\ufffd'));});
test('UTF-16 LE with BOM decodes',()=>{const b=new Uint8Array([0xff,0xfe,0xfc,0x00,0x62,0x00]);assert.equal(decodeBytes(b).text,'üb');});
test('legacy html gets a UTF-8 charset declaration, utf-8 html is untouched',()=>{
 const legacy=new Uint8Array([...utf8('<html><head><meta charset="iso-8859-1"></head><body>'),0xfc,...utf8('</body></html>')]);
 const d=decodeFileBytes('a.html',legacy);assert.match(d.text,/<meta charset="UTF-8">/);assert.match(d.text,/ü/);
 const ok='<html><head><meta charset="utf-8"></head><body>ü</body></html>';assert.equal(decodeFileBytes('a.html',utf8(ok)).text,ok);});
test('ensureUtf8Charset adds the meta when missing and rewrites http-equiv',()=>{
 assert.match(ensureUtf8Charset('<!doctype html><html><head><title>x</title></head><body>ä</body></html>'),/<head>\n  <meta charset="UTF-8"><title>/);
 assert.match(ensureUtf8Charset('<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1252"></head></html>'),/<meta charset="UTF-8">/);
 assert.equal(ensureUtf8Charset('body{content:"ä"}'),'body{content:"ä"}');
 assert.match(ensureUtf8Charset('<!doctype html><p>ä</p>'),/<meta charset="UTF-8">/);});
test('zip export keeps umlauts in file names and contents, and adds charset to html',()=>{
 const zip=projectArchive({'über/Käse.html':'<!doctype html><html><head></head><body>Größe</body></html>','style.css':'a::after{content:"ß"}'});
 const out=unzipSync(zip);assert.deepEqual(Object.keys(out).sort(),['style.css','über/Käse.html']);
 assert.match(strFromU8(out['über/Käse.html']),/<meta charset="UTF-8">[\s\S]*Größe/);assert.equal(strFromU8(out['style.css']),'a::after{content:"ß"}');});
test('single-file export declares UTF-8',()=>{assert.match(singleFileHtml({'i.html':'<html><head></head><body>ü</body></html>'},'i.html',{css:true,js:true}),/charset="UTF-8"/);});
