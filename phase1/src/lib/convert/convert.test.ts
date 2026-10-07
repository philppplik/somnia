import test from 'node:test';
import assert from 'node:assert/strict';
import {detectFormat,commonTargets,anyTargets,TARGETS} from './formats';
import {convertFile,type Rasterizer} from './engine';
import {parseDelimited,formatDelimited,jsonToRows,htmlToText,tableToJson} from './text';
import {runBatch,uniqueName,toBatchItem,type BatchItem} from './runner';
import {memorySink} from './sinks';
const u=(s:string)=>new TextEncoder().encode(s);
const s=(b:Uint8Array)=>new TextDecoder().decode(b);
const PNG=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
const JPG=Uint8Array.from([0xff,0xd8,0xff,0xe0,0,0]);
const WEBP=Uint8Array.from([0x52,0x49,0x46,0x46,1,0,0,0,0x57,0x45,0x42,0x50]);
const fakeRaster:Rasterizer=async(b,from,to,q)=>Uint8Array.from([...u(`${from}>${to}@${q}:`),...b.subarray(0,2)]);

test('detection: signature beats extension',()=>{
 assert.equal(detectFormat('photo.txt',PNG),'png');assert.equal(detectFormat('a.bin',JPG),'jpg');assert.equal(detectFormat('x',WEBP),'webp');
 assert.equal(detectFormat('fake.png',u('hello')),'unknown');
 assert.equal(detectFormat('doc.pdf',u('%PDF-1.7 ...')),'pdf');
});
test('detection: text by extension then content',()=>{
 assert.equal(detectFormat('a.md',u('x')),'md');assert.equal(detectFormat('a.CSV',u('a,b')),'csv');
 assert.equal(detectFormat('noext',u('{"a":1}')),'json');assert.equal(detectFormat('noext',u('<svg xmlns="http://www.w3.org/2000/svg"/>')),'svg');
 assert.equal(detectFormat('noext',u('<!DOCTYPE html><p>x')),'html');assert.equal(detectFormat('noext',u('a,b\n1,2\n3,4')),'csv');
 assert.equal(detectFormat('noext',u('# Title\n\ntext')),'md');assert.equal(detectFormat('noext',u('just words')),'txt');
 assert.equal(detectFormat('b.dat',Uint8Array.from([1,0,2,0,3,0,0,0])),'unknown');
});
test('target matrix',()=>{
 assert.deepEqual(commonTargets(['png','jpg']),['webp']);assert.deepEqual(commonTargets(['md','json']),[]);assert.deepEqual(commonTargets([]),[]);
 assert.ok(anyTargets(['md','csv']).includes('json'));assert.deepEqual(TARGETS.pdf,[]);
});
test('csv parsing handles quotes, commas, newlines, CRLF',()=>{
 assert.deepEqual(parseDelimited('a,"b,1","c ""q"""\r\n1,2,3\n',','),[['a','b,1','c "q"'],['1','2','3']]);
 assert.deepEqual(parseDelimited('a,"x\ny"\n',','),[['a','x\ny']]);assert.deepEqual(parseDelimited('',','),[]);
 assert.throws(()=>parseDelimited('a,"b',','));
 assert.equal(formatDelimited([['a','b,c'],['"q"','x']],','),'a,"b,c"\r\n"""q""",x\r\n');
});
test('csv to json and back',async()=>{
 const j=await convertFile('t.csv',u('name,age\nAda,36\nLin,\n'),'csv','json');
 assert.equal(j.name,'t.json');assert.deepEqual(JSON.parse(s(j.bytes)),[{name:'Ada',age:'36'},{name:'Lin',age:''}]);
 const c=await convertFile('t.json',j.bytes,'json','csv');assert.equal(s(c.bytes),'name,age\r\nAda,36\r\nLin,\r\n');
 assert.deepEqual(JSON.parse(tableToJson([['a','a',''],['1','2','3']])),[{a:'1',a_2:'2',column_3:'3'}]);
});
test('json to csv: union of keys, nested values, errors',()=>{
 assert.deepEqual(jsonToRows('[{"a":1},{"b":{"x":1}},{"a":null,"b":true}]'),[['a','b'],['1',''],['','{"x":1}'],['','true']]);
 assert.deepEqual(jsonToRows('[[1,2],[3]]'),[['1','2'],['3']]);
 assert.throws(()=>jsonToRows('{"a":1}'),/array/);assert.throws(()=>jsonToRows('nope'),/Invalid JSON/);assert.throws(()=>jsonToRows('[1,{"a":1}]'));
});
test('csv/tsv swap and csv to html escapes cells',async()=>{
 assert.equal(s((await convertFile('a.csv',u('a,b\n1,"x\ty"'),'csv','tsv')).bytes),'a\tb\r\n1\t"x\ty"\r\n');
 assert.equal(s((await convertFile('a.tsv',u('a\tb\n1\t2'),'tsv','csv')).bytes),'a,b\r\n1,2\r\n');
 const h=s((await convertFile('a.csv',u('h\n<script>'),'csv','html')).bytes);assert.match(h,/<th>h<\/th>/);assert.match(h,/&lt;script&gt;/);assert.doesNotMatch(h,/<script>/);
});
test('markdown and html conversions',async()=>{
 const h=await convertFile('doc.md',u('# Hi\n\nA **b** [l](https://x.test)'),'md','html');const t=s(h.bytes);
 assert.equal(h.name,'doc.html');assert.match(t,/<h1[^>]*>Hi<\/h1>/);assert.match(t,/<strong>b<\/strong>/);assert.match(t,/<!doctype html>/);
 const md=s((await convertFile('p.html',u('<h1>T</h1><p>one <em>two</em></p>'),'html','md')).bytes);assert.match(md,/^# T/);assert.match(md,/\*two\*|_two_/);
 assert.equal(htmlToText('<style>a{}</style><h1>T &amp; U</h1><p>x<br>y</p><ul><li>a</li></ul>'),'T & U\n\nx\ny\n\n- a\n');
 assert.equal(s((await convertFile('d.md',u('# T\n\ntext'),'md','txt')).bytes).trim(),'T\n\ntext');
 const th=s((await convertFile('n.txt',u('a <b>\nc\n\nd'),'txt','html')).bytes);assert.match(th,/<p>a &lt;b&gt;<br>\nc<\/p>/);assert.match(th,/<p>d<\/p>/);
});
test('utf-16 and BOM text decode',async()=>{
 const bom=Uint8Array.from([0xef,0xbb,0xbf,...u('a,b\n1,2')]);assert.deepEqual(JSON.parse(s((await convertFile('x.csv',bom,'csv','json')).bytes)),[{a:'1',b:'2'}]);
});
test('unsupported pairs and unknown sources fail loudly',async()=>{
 await assert.rejects(convertFile('a.pdf',u('%PDF-'),'pdf','png',{rasterize:fakeRaster}),/cannot be converted/);
 await assert.rejects(convertFile('a.bin',u('x'),'unknown','png'),/Unrecognised/);
 await assert.rejects(convertFile('a.png',PNG,'png','jpg'),/canvas/);
 await assert.rejects(convertFile('a.md',u('x'),'md','png',{rasterize:fakeRaster}),/cannot be converted/);
});
test('image conversion goes through the rasterizer with clamped quality',async()=>{
 const r=await convertFile('pic.png',PNG,'png','jpg',{rasterize:fakeRaster,quality:5});
 assert.equal(r.name,'pic.jpg');assert.equal(r.mime,'image/jpeg');assert.match(s(r.bytes),/^png>jpg@1:/);
 assert.match(s((await convertFile('p.svg',u('<svg/>'),'svg','webp',{rasterize:fakeRaster,quality:0})).bytes),/^svg>webp@0\.1:/);
});
test('uniqueName avoids existing and in-batch names, case-insensitively',async()=>{
 const sink=memorySink(['A.json']);const taken=new Set<string>();
 assert.equal(await uniqueName('a.json',sink,taken),'a (2).json');assert.equal(await uniqueName('a.json',sink,taken),'a (3).json');assert.equal(await uniqueName('b.json',sink,taken),'b.json');
});
const item=(id:string,name:string,text:string,fmt:BatchItem['format']):BatchItem=>({id,name,bytes:u(text),format:fmt});
test('batch: partial failure, skip, collisions, progress, finish',async()=>{
 const sink=memorySink();const events:string[]=[];
 const items=[item('1','a.csv','x,y\n1,2','csv'),item('2','bad.csv','a,"b','csv'),item('3','a.csv','q\n9','csv'),item('4','pic.png','','png')];
 items[3]={...items[3],bytes:PNG};
 const r=await runBatch(items,{target:'json',sink,onProgress:(p,sum)=>events.push(`${p.id}:${p.state}:${sum.finished}/${sum.total}`)});
 assert.equal(r.done,2);assert.equal(r.failed,1);assert.equal(r.skipped,1);
 assert.deepEqual([...sink.files.keys()].sort(),['a (2).json','a.json']);
 assert.match(r.items[1].error!,/Unterminated/);assert.match(r.items[3].error!,/cannot become/);
 assert.equal(sink.finished,true);assert.ok(events.includes('1:running:0/4'));assert.ok(events.at(-1)!.endsWith('4/4'));
});
test('batch: cancellation stops remaining files and write errors are per file',async()=>{
 const ac=new AbortController();const sink=memorySink();
 const items=[item('1','a.csv','a\n1','csv'),item('2','b.csv','a\n2','csv'),item('3','c.csv','a\n3','csv')];
 const r=await runBatch(items,{target:'json',sink,signal:ac.signal,onProgress:p=>{if(p.id==='1'&&p.state==='done')ac.abort();}});
 assert.deepEqual(r.items.map(i=>i.state),['done','cancelled','cancelled']);
 const bad:ReturnType<typeof memorySink>={...memorySink(),write:async()=>{throw Error('disk full');}};
 const r2=await runBatch(items.slice(0,1),{target:'json',sink:bad});assert.equal(r2.failed,1);assert.equal(r2.items[0].error,'disk full');
});
test('batch: no finish flush when nothing converted',async()=>{
 const sink=memorySink();await runBatch([item('1','b.csv','a,"b','csv')],{target:'json',sink});assert.equal(sink.finished,false);
});
test('toBatchItem reads and detects, rejects oversize',async()=>{
 const f={name:'a.json',size:7,arrayBuffer:async()=>u('[{"a":1}]').buffer as ArrayBuffer};
 const it=await toBatchItem(f,'x');assert.equal(it.format,'json');
 await assert.rejects(toBatchItem({...f,size:300*1024*1024},'y'),/200 MB/);
});
