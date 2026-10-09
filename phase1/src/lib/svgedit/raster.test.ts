import test from 'node:test';import assert from 'node:assert/strict';
import {prepareSvg,exportSize,registerRasterizer,getRasterizer,rasterizers} from './raster';
test('prepareSvg sets pixel size, adds viewBox and xmlns, keeps the rest',()=>{
 const out=prepareSvg('<svg width="100" height="50">\n  <!-- keep -->\n  <rect width="10" height="10"/>\n</svg>',100,50,300,150);
 assert.match(out,/width="300"/);assert.match(out,/height="150"/);assert.match(out,/viewBox="0 0 100 50"/);assert.match(out,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);assert.ok(out.includes('<!-- keep -->'));});
test('prepareSvg keeps an existing viewBox',()=>{
 const out=prepareSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 80 40"><rect/></svg>',80,40,160,80);
 assert.match(out,/viewBox="10 10 80 40"/);assert.equal((out.match(/viewBox/g)??[]).length,1);});
test('prepareSvg rejects broken svg',()=>{assert.throws(()=>prepareSvg('<svg><rect></svg>',1,1,1,1));});
test('exportSize rounds, and refuses huge or invalid sizes',()=>{
 assert.deepEqual(exportSize(100.4,50,2),{w:201,h:100});
 assert.throws(()=>exportSize(10000,10000,2),/megapixels/);assert.throws(()=>exportSize(0,10,1));assert.throws(()=>exportSize(10,10,-1));});
test('a registered native backend wins over the built-in one, explicit id selects',async()=>{
 registerRasterizer({id:'canvas',render:async()=>new Blob(['c'])});
 assert.equal(getRasterizer().id,'canvas');
 registerRasterizer({id:'native',render:async()=>new Blob(['n'])});
 assert.equal(getRasterizer().id,'native');assert.equal(getRasterizer('canvas').id,'canvas');assert.equal(getRasterizer('nope').id,'native');
 assert.deepEqual(rasterizers().sort(),['canvas','native']);});
