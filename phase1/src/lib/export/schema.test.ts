import test from 'node:test';import assert from 'node:assert/strict';
import {visibleExportFields,exportFieldGroups,formatExportSize,type ExportSchema} from './schema';
import {exportDimensions,aspectComplement} from './dimensions';
import {injectPngMetadata,readPngMetadata,injectJpegMetadata,readJpegMetadata,EMPTY_EXPORT_METADATA} from './metadata';
const schema:ExportSchema={studio:'test',defaults:{a:'x',b:1,c:true},validate:v=>typeof v.a==='string'&&v.a?null:'err',fields:[
 {id:'a',type:'text',labelKey:'l.a'},{id:'b',type:'number',labelKey:'l.b',group:'g.n',min:1,max:9},
 {id:'c',type:'checkbox',labelKey:'l.c',group:'g.n'},{id:'d',type:'select',labelKey:'l.d',visibleWhen:v=>v.c===true,options:[{value:'1',labelKey:'l.1'}]}]};
test('visible fields honour visibleWhen and groups stay in declaration order',()=>{assert.deepEqual(visibleExportFields(schema,{a:'x',b:1,c:false}).map(f=>f.id),['a','b','c']);
 assert.deepEqual(visibleExportFields(schema,{a:'x',b:1,c:true}).map(f=>f.id),['a','b','c','d']);
 assert.deepEqual(exportFieldGroups(schema,{a:'x',b:1,c:true}),[null,'g.n']);});
test('schema validate returns error key or null',()=>{assert.equal(schema.validate({a:'',b:1,c:true}),'err');assert.equal(schema.validate({a:'x',b:1,c:true}),null);});
test('formatExportSize picks sensible units',()=>{const u={b:'B',kb:'KB',mb:'MB'};assert.equal(formatExportSize(512,u),'512 B');assert.equal(formatExportSize(8192,u),'8.0 KB');assert.equal(formatExportSize(2.4*1024*1024,u),'2.4 MB');assert.equal(formatExportSize(-1,u),'');});
test('percent and exact dimensions with aspect lock and clamps',()=>{const src={sourceWidth:2000,sourceHeight:1000};
 assert.deepEqual(exportDimensions({...src,mode:'percent',percent:50,width:0,height:0,lockAspect:true}),{width:1000,height:500});
 assert.throws(()=>exportDimensions({...src,mode:'percent',percent:0,width:0,height:0,lockAspect:true}),/1\.\.800/);
 assert.deepEqual(exportDimensions({...src,mode:'exact',percent:100,width:800,height:0,lockAspect:true}),{width:800,height:400});
 assert.deepEqual(exportDimensions({...src,mode:'exact',percent:100,width:640,height:480,lockAspect:false}),{width:640,height:480});
 assert.throws(()=>exportDimensions({...src,mode:'exact',percent:100,width:20000,height:20000,lockAspect:false}),/16 MP/);
 assert.throws(()=>exportDimensions({...src,mode:'exact',percent:100,width:0,height:0,lockAspect:true}),/width or height/);
 assert.equal(aspectComplement({width:2000,height:1000},'width',500),250);});
function pngFixture():Uint8Array{
 // Minimal PNG: signature + IHDR-less IEND is invalid, so build signature + IDAT stub + IEND.
 const sig=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
 const idat=[0,0,0,1,0x49,0x44,0x41,0x54,0x78,0,0,0,0];const iend=[0,0,0,0,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82];
 return new Uint8Array([...sig,...idat,...iend]);
}
test('PNG metadata round-trips and empty metadata is a no-op',()=>{const png=pngFixture();
 assert.equal(injectPngMetadata(png,EMPTY_EXPORT_METADATA),png);
 const meta={title:'Tile A',author:'Philipp',copyright:'(c) 2026',description:'Grüße ß ü'};
 const out=injectPngMetadata(png,meta);
 assert.ok(out.length>png.length);
 const back=readPngMetadata(out);
 assert.equal(back.title,'Tile A');assert.equal(back.author,'Philipp');assert.equal(back.copyright,'(c) 2026');
 assert.equal(back.description,'Grüße ß ü');
 // IEND still terminates the file
 assert.deepEqual([...out.subarray(-8,-4)],[0x49,0x45,0x4e,0x44]);
 assert.throws(()=>injectPngMetadata(new Uint8Array([1,2,3]),meta),/Not a PNG/);});
test('JPEG metadata round-trips and lands before scan data',()=>{const jpeg=new Uint8Array([0xff,0xd8,0xff,0xe0,0,4,1,2,0xff,0xda,0,2,9,9,0xff,0xd9]);
 const meta={title:'Sunset',author:'',copyright:'',description:'Lake'};
 const out=injectJpegMetadata(jpeg,meta);
 assert.ok(out.length>jpeg.length);
 const back=readJpegMetadata(out);assert.equal(back.title,'Sunset');assert.equal(back.description,'Lake');assert.equal(back.author,undefined);
 assert.equal(out[out.length-2],0xff);assert.equal(out[out.length-1],0xd9);
 assert.throws(()=>injectJpegMetadata(pngFixture(),meta),/Not a JPEG/);
 assert.equal(injectJpegMetadata(jpeg,EMPTY_EXPORT_METADATA),jpeg);});
