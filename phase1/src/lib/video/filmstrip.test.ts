import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {bucketStep,bucketTime,layoutStrip,tileHeightFor,tileKey} from './filmstrip-model';
import {FilmstripController,type Thumb,type ThumbDecoder} from './filmstrip-controller';
import {FILMSTRIP_CATALOGUES} from './filmstrip-i18n';

class FakeDecoder implements ThumbDecoder{
 calls:{times:number[]}[]=[];closed=0;made:{closed:boolean}[]=[];opened=new Map<string,ArrayBuffer>();failTimes=new Set<number>();gate:Promise<void>|null=null;
 async open(k:string,b:ArrayBuffer){this.opened.set(k,b);if(b.byteLength===0)throw new Error('bad file');return{duration:10,width:320,height:180};}
 async thumbs(_k:string,times:number[],w:number,h:number){
  this.calls.push({times});if(this.gate)await this.gate;
  return times.map(t=>{if(this.failTimes.has(t))return null;const th={width:w,height:h,closed:false,close(){th.closed=true;}};this.made.push(th);return th as Thumb&{closed:boolean};});
 }
 close(){this.closed++;}dispose(){}
}
const wait=()=>new Promise(r=>setTimeout(r,5));
const layout=(o:Partial<Parameters<typeof layoutStrip>[0]>={})=>layoutStrip({widthPx:400,heightPx:24,aspect:16/9,in_s:0,out_s:10,duration:10,...o});

test('bucket step snaps up to the ladder and tile heights to the allowed set',()=>{
 assert.equal(bucketStep(0.3),0.5);assert.equal(bucketStep(1),1);assert.equal(bucketStep(9999),300);
 assert.equal(tileHeightFor(25),32);assert.equal(tileHeightFor(500),96);
 assert.equal(bucketTime(100,1,10),9.98);assert.equal(bucketTime(2,0.5,10),1);
});
test('layout: tiles cover the clip, last tile is cut, times stay inside the source range',()=>{
 const l=layout();
 assert.ok(l.tiles.length>=9);
 assert.equal(l.tiles[0].x,0);
 const last=l.tiles[l.tiles.length-1];assert.ok(Math.abs(last.x+last.width-400)<1e-9);
 for(const t of l.tiles){assert.ok(t.time>=0&&t.time<=10);assert.ok(t.width>0&&t.width<=l.tileWidth);}
 for(let i=1;i<l.tiles.length;i++)assert.ok(l.tiles[i].time>=l.tiles[i-1].time);
});
test('layout: degenerate input yields no tiles, never NaN',()=>{
 assert.equal(layout({widthPx:0}).tiles.length,0);assert.equal(layout({out_s:0}).tiles.length,0);
 const l=layout({aspect:NaN});assert.ok(l.tiles.every(t=>Number.isFinite(t.time)&&Number.isFinite(t.x)));
});
test('trimming reuses source-time buckets: a trimmed layout is a subset of the full layout keys',()=>{
 const full=layout({widthPx:1000});
 const trimmed=layout({widthPx:500,in_s:0,out_s:5});
 assert.equal(trimmed.step,full.step);
 const keys=new Set(full.tiles.map(t=>t.index));
 assert.ok(trimmed.tiles.every(t=>keys.has(t.index)));
});
test('moving a clip changes nothing: layout depends on source range and width only',()=>{
 assert.deepEqual(layout(),layout());
});
test('controller decodes each bucket once, then serves it from cache',async()=>{
 const d=new FakeDecoder(),c=new FilmstripController(d);
 c.register('a.webm',new ArrayBuffer(8));await wait();
 assert.equal(c.state('a.webm'),'ready');
 const l=layout(),reqs=l.tiles.map(tile=>({source:'a.webm',tile,height:l.tileHeight}));
 c.want('x',reqs);await wait();await wait();
 const n=d.calls.reduce((s,x)=>s+x.times.length,0);
 assert.ok(c.get('a.webm',l.tiles[0],l.tileHeight));
 assert.ok(n<=new Set(l.tiles.map(t=>t.index)).size);
 c.want('x',reqs);await wait();
 assert.equal(d.calls.reduce((s,x)=>s+x.times.length,0),n);
});
test('trim does not redecode buckets already cached',async()=>{
 const d=new FakeDecoder(),c=new FilmstripController(d);
 c.register('a',new ArrayBuffer(8));await wait();
 const full=layout({widthPx:800}),mk=(l:typeof full)=>l.tiles.map(tile=>({source:'a',tile,height:l.tileHeight}));
 c.want('x',mk(full));await wait();await wait();
 const before=c.batches;
 c.want('x',mk(layout({widthPx:400,in_s:0,out_s:5})));await wait();
 assert.equal(c.batches,before);
});
test('latest wins: requests replaced before they run are never decoded',async()=>{
 const d=new FakeDecoder(),c=new FilmstripController(d,{batch:2});
 c.register('a',new ArrayBuffer(8));await wait();
 let open!:()=>void;d.gate=new Promise(r=>{open=r;});
 const l1=layout({in_s:0,out_s:2,widthPx:400}),l2=layout({in_s:8,out_s:10,widthPx:400});
 c.want('x',l1.tiles.map(tile=>({source:'a',tile,height:l1.tileHeight})));await wait();
 c.want('x',l2.tiles.map(tile=>({source:'a',tile,height:l2.tileHeight})));
 d.gate=null;open();await wait();await wait();await wait();
 const decoded=d.calls.flatMap(x=>x.times);
 const firstBatch=d.calls[0].times.length;
 assert.ok(decoded.slice(firstBatch).every(t=>t>=7),'after the in-flight batch only the new range is decoded');
});
test('nearest() stands in for a missing tile so the strip never blanks',async()=>{
 const d=new FakeDecoder(),c=new FilmstripController(d);
 c.register('a',new ArrayBuffer(8));await wait();
 const l=layout();c.want('x',l.tiles.slice(0,1).map(tile=>({source:'a',tile,height:l.tileHeight})));await wait();await wait();
 assert.ok(c.nearest('a',9));assert.equal(c.nearest('zzz',1),null);
});
test('re-registering a source invalidates thumbnails and ignores in-flight results',async()=>{
 const d=new FakeDecoder(),c=new FilmstripController(d);
 c.register('a',new ArrayBuffer(8));await wait();
 const l=layout(),reqs=l.tiles.map(tile=>({source:'a',tile,height:l.tileHeight}));
 c.want('x',reqs);await wait();await wait();
 const old=d.made.slice();assert.ok(old.length>0);
 c.register('a',new ArrayBuffer(8));
 assert.ok(old.every(t=>t.closed),'old thumbnails are freed');
 assert.equal(c.get('a',l.tiles[0],l.tileHeight),null);assert.equal(c.size,0);
 assert.notEqual(tileKey('a',1,1,1,24),tileKey('a',2,1,1,24));
});
test('LRU eviction closes bitmaps and keeps the cache bounded, sparing wanted tiles',async()=>{
 const d=new FakeDecoder(),c=new FilmstripController(d,{maxTiles:5,batch:3});
 c.register('a',new ArrayBuffer(8));await wait();
 for(let s=0;s<4;s++){const l=layout({in_s:s*2,out_s:s*2+2,widthPx:200});c.want('x',l.tiles.map(tile=>({source:'a',tile,height:l.tileHeight})));await wait();await wait();await wait();}
 assert.ok(c.size<=5+3);assert.ok(d.made.some(t=>t.closed));
 const last=layout({in_s:6,out_s:8,widthPx:200});
 assert.ok(c.get('a',last.tiles[0],last.tileHeight),'currently wanted tiles survive eviction');
});
test('failed frames are not retried forever; failed source reports state',async()=>{
 const d=new FakeDecoder(),c=new FilmstripController(d);
 c.register('bad',new ArrayBuffer(0));await wait();assert.equal(c.state('bad'),'failed');
 c.register('a',new ArrayBuffer(8));await wait();
 const l=layout({widthPx:100});d.failTimes.add(l.tiles[0].time);
 const reqs=l.tiles.map(tile=>({source:'a',tile,height:l.tileHeight}));
 c.want('x',reqs);await wait();await wait();const n=d.calls.length;c.want('x',reqs);await wait();
 assert.equal(d.calls.length,n);
});
test('unregister frees thumbnails and closes the decoder source',async()=>{
 const d=new FakeDecoder(),c=new FilmstripController(d);
 c.register('a',new ArrayBuffer(8));await wait();
 const l=layout();c.want('x',l.tiles.map(tile=>({source:'a',tile,height:l.tileHeight})));await wait();await wait();
 c.unregister('a');assert.equal(c.size,0);assert.equal(d.closed,1);assert.equal(c.state('a'),'unknown');
});
test('filmstrip locales: five languages, identical keys, placeholders preserved, non-empty',()=>{
 const langs=Object.keys(FILMSTRIP_CATALOGUES).sort();
 assert.deepEqual(langs,['de','en','es','fr','pt-BR']);
 const ph=(s:string)=>(s.match(/\{\w+\}/g)??[]).sort().join();
 const en=FILMSTRIP_CATALOGUES.en;
 for(const l of langs){
  assert.deepEqual(Object.keys(FILMSTRIP_CATALOGUES[l]).sort(),Object.keys(en).sort());
  for(const k of Object.keys(en)){assert.ok(FILMSTRIP_CATALOGUES[l][k].trim().length>0);assert.equal(ph(FILMSTRIP_CATALOGUES[l][k]),ph(en[k]),`${l}:${k}`);}
 }
 const dir=new URL('../../locales/video/',import.meta.url);
 assert.equal(readdirSync(dir).filter(f=>f.startsWith('filmstrip.')).length,5);
 assert.ok(readFileSync(new URL('filmstrip.en.json',dir),'utf8').includes('video.filmstripAria'));
});
