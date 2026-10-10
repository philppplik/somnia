import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const leb=n=>{const out=[];do{let b=n&127;n>>>=7;if(n)b|=128;out.push(b);}while(n);return out;};
const text=s=>[...leb(s.length),...new TextEncoder().encode(s)];
const section=(id,b)=>[id,...leb(b.length),...b];
const body=code=>[...leb(code.length+1),0,...code];
function fixture(runaway=false,outOfBounds=false){return [0,97,115,109,1,0,0,0,
 ...section(1,[4,0x60,2,0x7f,0x7f,1,0x7f,0x60,1,0x7f,1,0x7f,0x60,2,0x7f,0x7f,0,0x60,0,1,0x7f]),
 ...section(2,[1,...text('somnia'),...text('emit'),0,0]),...section(3,[4,1,2,3,0]),...section(5,[1,1,1,...leb(2048)]),
 ...section(7,[5,...text('memory'),2,0,...text('alloc'),0,1,...text('dealloc'),0,2,...text('init'),0,3,...text('dispatch'),0,4]),
 ...section(10,[4,...body(outOfBounds?[0x41,0x7f,0x0b]:[0x41,0,0x0b]),...body([0x0b]),...body([0x41,0,0x0b]),...body(runaway?[0x03,0x40,0x0c,0,0x0b,0x41,0,0x0b]:[0x41,0,0x0b])])];}
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error'});
let browser;
try{
 await server.listen();const port=server.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage();
 // Minimal host page, avoiding the application's unrelated missing engine build artifacts.
 await page.route('**/runtime-smoke',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Wasm runtime smoke</title>'}));await page.goto(`http://127.0.0.1:${port}/runtime-smoke`);
 const result=await page.evaluate(async fixtures=>{
  const {browserWasmFactory}=await import('/src/lib/extensions/v2/browserWasmTransport.ts');
  const test=async(bytes,expectError)=>{
   const abort=new AbortController();const factory=browserWasmFactory(async()=>Uint8Array.from(bytes));const transport=await factory({extensionId:'acme.smoke',digest:'a'.repeat(64),generation:1,apiVersion:'2.0.0',protocolVersion:1,runtime:{type:'wasm',entry:'guest.wasm',abi:'somnia-json-1'}},abort.signal);
   const start=performance.now();const outcome=await new Promise(resolve=>{transport.onError=()=>resolve('error');transport.send({protocolVersion:1,generation:1,method:'event',params:{}});setTimeout(()=>resolve('alive'),expectError?1500:200);});const elapsed=performance.now()-start;transport.terminate();return {outcome,elapsed};
  };
  return {normal:await test(fixtures.normal,false),runaway:await test(fixtures.runaway,true),bounds:await test(fixtures.bounds,true)};
 },{normal:fixture(),runaway:fixture(true),bounds:fixture(false,true)});
 assert.equal(result.normal.outcome,'alive');assert.equal(result.runaway.outcome,'error');assert.equal(result.bounds.outcome,'error');assert.ok(result.runaway.elapsed<1500);
 console.log('PASS real Chromium worker: bounded guest turn, runaway termination, invalid pointer rejection.');console.log(JSON.stringify(result));
}finally{await browser?.close();await server.close();}
