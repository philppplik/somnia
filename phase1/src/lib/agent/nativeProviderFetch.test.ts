import {test} from 'node:test';import assert from 'node:assert/strict';import {nativeProviderFetch} from './nativeProviderFetch';
test('native transport omits renderer credentials and passes bounded chunks',async()=>{
 const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldFlag=Object.getOwnPropertyDescriptor(globalThis,'isTauri');
 const calls:{command:string;args:any}[]=[];let chunk=0;
 Object.defineProperty(globalThis,'isTauri',{value:true,configurable:true});
 Object.defineProperty(globalThis,'window',{value:{__TAURI_INTERNALS__:{invoke:async(command:string,args:any)=>{calls.push({command,args});return command==='provider_http_start'?{id:'fixture',status:200,headers:{'content-type':'text/plain'}}:command==='provider_http_next'?(chunk++===0?[111,107]:null):null;}}},configurable:true});
 try{const r=await nativeProviderFetch('openai')('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer fixture-renderer-key'}});assert.equal(await r.text(),'ok');assert.ok(!JSON.stringify(calls).includes('fixture-renderer-key'));assert.equal(calls[0].args.candidateKey,null);assert.ok(!calls.some(c=>c.command==='agent_key_load'));}
 finally{if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');if(oldFlag)Object.defineProperty(globalThis,'isTauri',oldFlag);else Reflect.deleteProperty(globalThis,'isTauri');}
});
