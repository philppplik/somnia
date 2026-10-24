import test from 'node:test';
import assert from 'node:assert/strict';
import {sniffImage,altFromName,MAX_IMAGE_BYTES} from './imageSniff';
import {png,jpeg} from './imageFixtures';

test('sniffImage reads PNG and JPEG headers',()=>{
  assert.deepEqual(sniffImage(png(640,480)),{ext:'png',mime:'image/png',width:640,height:480});
  assert.deepEqual(sniffImage(jpeg(1024,768)),{ext:'jpeg',mime:'image/jpeg',width:1024,height:768});
});
test('sniffImage refuses unknown, truncated, empty-size, oversized and huge-dimension input',()=>{
  assert.throws(()=>sniffImage(new Uint8Array(0)),/PNG or JPEG/);
  assert.throws(()=>sniffImage(new Uint8Array(64).fill(7)),/Only PNG and JPEG/);
  assert.throws(()=>sniffImage(png(0,10)),/size could not be read/);
  assert.throws(()=>sniffImage(png(10,0)),/size could not be read/);
  assert.throws(()=>sniffImage(png(16385,10)),/larger than/);
  assert.throws(()=>sniffImage(png(10000,10000)),/larger than/);
  assert.throws(()=>sniffImage(jpeg(0,5)),/size could not be read/);
  const bad=png(5,5);bad[15]=0x58;assert.throws(()=>sniffImage(bad),/PNG header/);
  const svg=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');assert.throws(()=>sniffImage(svg),/Only PNG and JPEG/);
  assert.throws(()=>sniffImage(new Uint8Array(MAX_IMAGE_BYTES+1)),/10 MiB/);
  const trunc=jpeg(5,5).slice(0,24);assert.throws(()=>sniffImage(trunc));
  assert.throws(()=>sniffImage('x' as never),/PNG or JPEG/);
});
test('altFromName keeps a short, plain description',()=>{
  assert.equal(altFromName('C:\\pics\\Team photo 2026.PNG'),'Team photo 2026');
  assert.equal(altFromName('a<b>&"c".jpg'),'a b c');
  assert.equal(altFromName('x'.repeat(500)+'.png').length,200);
  assert.equal(altFromName('.png'),'');
});
