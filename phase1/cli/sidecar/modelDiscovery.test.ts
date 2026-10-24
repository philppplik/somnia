import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {discoverModels} from './modelDiscovery';
test('CLI discovery uses read-only GET and never verifies inference',async()=>{
 const paths:string[]=[];const server=http.createServer((req,res)=>{paths.push(req.method+' '+req.url);res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'test.gguf'}]}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;
 try{const result=await discoverModels('llama.cpp','http://127.0.0.1:'+port);assert.deepEqual(paths,['GET /v1/models']);assert.equal(result.inferenceVerified,false);assert.equal(result.models[0].locality,'unverified');}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('CLI rejects remote and does not follow redirect',async()=>{
 await assert.rejects(discoverModels('llama.cpp','http://remote.invalid'));
 const server=http.createServer((_req,res)=>{res.writeHead(302,{location:'http://remote.invalid'});res.end();});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await assert.rejects(discoverModels('llama.cpp','http://127.0.0.1:'+(server.address() as {port:number}).port),/302/);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
