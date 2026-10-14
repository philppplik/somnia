import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore,type DocSessionLike} from './core';
import {imageProblem,sniffImage,MAX_IMAGE_BYTES} from './protocol';
const png=(w:number,h:number,extra=0)=>{const b=new Uint8Array(24+extra);b.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52]);const dv=new DataView(b.buffer);dv.setUint32(16,w);dv.setUint32(20,h);return b;};
const jpeg=(w:number,h:number)=>new Uint8Array([0xff,0xd8,0xff,0xe0,0,4,0,0,0xff,0xc0,0,11,8,h>>8,h&255,w>>8,w&255,3,1,0x22,0]);
test('PNG and JPEG sizes come from the header, everything else is refused',()=>{
 assert.deepEqual(sniffImage(png(640,480)),{type:'png',w:640,h:480});
 assert.deepEqual(sniffImage(jpeg(200,300)),{type:'jpeg',w:200,h:300});
 for(const bad of [new Uint8Array(0),new TextEncoder().encode('GIF89a....'),new Uint8Array([0xff,0xd8]),new Uint8Array([0xff,0xd8,0,0]),new Uint8Array([0xff,0xd8,0xff,0xe0,0,1]),png(1,1).slice(0,20)])assert.equal(sniffImage(bad),null);
});
test('image limits: 5 MB, 8000 px a side, 25 megapixels',()=>{
 assert.equal(imageProblem(png(100,100)),null);
 assert.equal(imageProblem(new Uint8Array(0)),'empty');
 assert.equal(imageProblem(png(100,100,MAX_IMAGE_BYTES)),'size');
 assert.equal(imageProblem(new TextEncoder().encode('not an image at all, just text')),'type');
 assert.equal(imageProblem(png(8001,10)),'dimensions');
 assert.equal(imageProblem(png(10,8001)),'dimensions');
 assert.equal(imageProblem(png(0,10)),'dimensions');
 assert.equal(imageProblem(png(6000,5000)),'dimensions');
 assert.equal(imageProblem(png(5000,5000)),null);
});
function core(){
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}
  insert_image(b:number,bytes:Uint8Array,alt:string){calls.push(`ins ${b} ${bytes.length} ${alt}`);}resize_image(b:number,w:number){calls.push(`size ${b} ${w}`);}fit_image(b:number,p:number){calls.push(`fit ${b} ${p}`);}set_image_alt(b:number,a:string){calls.push(`alt ${b} ${a}`);}remove_image(b:number){calls.push(`rm ${b}`);}} as unknown as new(b:Uint8Array)=>DocSessionLike;
 const k=new DocumentsCore(S);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);return{k,calls};
}
const ins=(k:DocumentsCore,block:unknown,bytes:Uint8Array,alt:unknown='')=>k.handle({id:2,kind:'insertImage',block,bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),alt} as never).res.ok;
const ed=(k:DocumentsCore,block:unknown,op:unknown)=>k.handle({id:3,kind:'imageEdit',block,op} as never).res.ok;
test('malformed image requests never reach the engine',()=>{
 const {k,calls}=core();
 for(const [b,bytes,alt] of [[-1,png(10,10),''],[1.5,png(10,10),''],[2**31,png(10,10),''],[0,png(8001,10),''],[0,new Uint8Array(0),''],[0,new TextEncoder().encode('GIF89a...'),''],[0,png(10,10),'a\nb'],[0,png(10,10),7],[0,png(10,10),'x'.repeat(501)]] as [unknown,Uint8Array,unknown][])assert.equal(ins(k,b,bytes,alt),false,String(b)+String(alt));
 assert.equal(k.handle({id:2,kind:'insertImage',block:0,bytes:'x',alt:''} as never).res.ok,false);
 for(const op of [null,'x',{op:'resize',width:5},{op:'resize',width:2001},{op:'resize',width:Number.NaN},{op:'resize',width:'9'},{op:'fit',percent:33},{op:'fit',percent:'50'},{op:'alt',alt:'a\u0000'},{op:'alt',alt:3},{op:'nope'}])assert.equal(ed(k,0,op),false,JSON.stringify(op));
 assert.equal(ed(k,-1,{op:'remove'}),false);
 assert.deepEqual(calls,[]);
});
test('valid image requests reach the engine once',()=>{
 const {k,calls}=core();
 assert.equal(ins(k,3,png(10,10),'A chart'),true);assert.equal(ed(k,1,{op:'resize',width:100}),true);assert.equal(ed(k,1,{op:'fit',percent:50}),true);assert.equal(ed(k,1,{op:'alt',alt:'x'}),true);assert.equal(ed(k,1,{op:'remove'}),true);
 assert.deepEqual(calls,['ins 3 24 A chart','size 1 100','fit 1 50','alt 1 x','rm 1']);
});
