import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installFileAdapter,type FilePort} from '../fileAdapter';
import {getState,patchState} from '../../store/appStore';
import {clearMedia,findMedia} from '../media';
import {getOpenChoice,answerOpenChoice} from './openChoice';
import './index';
const tick=()=>new Promise(r=>setTimeout(r,10));
async function until(fn:()=>boolean){for(let i=0;i<100&&!fn();i++)await tick();assert.ok(fn());}
function portFor(name:string,bytes:Uint8Array){
 const listeners=new Map<string,(e:{payload:any})=>void>();const closed:string[]=[];let next=true;
 const port:FilePort={shell:{async closeWindow(){},async destroyWindow(){}},
 async invoke<T>(command:string){
  if(command==='open_startup_file'){if(!next)return null as T;next=false;return{projectId:'selected',name} as T;}
  if(command==='read_open_bytes')return Buffer.from(bytes).toString('base64') as T;
  if(command==='read_file')return {content:new TextDecoder().decode(bytes),revision:{exists:true,hash:'same'}} as T;
  if(command==='close_project'){closed.push('selected');return undefined as T;}
  if(command==='read_project_settings')return null as T;
  if(command==='recovery_list')return [] as T;
  throw Error('Unexpected command '+command);
 },async listen(event,handler){listeners.set(event,handler);return()=>{listeners.delete(event);};}};
 return{port,closed,listeners};
}
test('native OS Open-with from Video routes actual Office bytes to Documents without a suffix',async()=>{
 clearMedia();patchState({activeStudio:'video',studioChoice:'manual',isDirty:false,coreConnected:false,files:{},openFiles:[]});
 const h=portFor('renamed',new Uint8Array(readFileSync('test/documents/sample.docx')));const stop=await installFileAdapter(h.port);
 await until(()=>getState().activeStudio==='documents');assert.equal(findMedia('renamed')?.kind,'docx');await until(()=>h.closed.length===1);stop();clearMedia();
});
test('native unrecognized file presents choice and cancel does not attach or change Studio',async()=>{
 patchState({activeStudio:'video',studioChoice:'manual',isDirty:false,coreConnected:false,files:{},openFiles:[]});
 const h=portFor('notes.unknown',new TextEncoder().encode('hello'));const stop=await installFileAdapter(h.port);
 await until(()=>getOpenChoice()!==null);assert.equal(getOpenChoice()?.suggested,undefined);assert.equal(getState().activeStudio,'video');
 answerOpenChoice(null);await until(()=>h.closed.length===1);assert.equal(getState().activeStudio,'video');assert.equal(getState().nativeConnected,false);stop();
});
test('native Code source opens in place and switches away from manually selected Video',async()=>{
 patchState({activeStudio:'video',studioChoice:'manual',isDirty:false,coreConnected:false,files:{},openFiles:[]});
 const h=portFor('site.html',new TextEncoder().encode('<h1>hello</h1>'));const stop=await installFileAdapter(h.port);
 await until(()=>getState().nativeConnected&&getState().activeStudio==='code');assert.equal(getState().files['site.html'],'<h1>hello</h1>');assert.equal(getState().storage,'disk');assert.deepEqual(h.closed,[]);stop();
});
test('native drop suggests visible Studio but offers only compatible text editor',async()=>{
 patchState({activeStudio:'video',studioChoice:'manual',isDirty:false,coreConnected:false,nativeConnected:false,files:{},openFiles:[]});
 const base=portFor('notes.unknown',new TextEncoder().encode('hello'));
 const invoke=base.port.invoke;let startup=true;
 base.port.invoke=async<T>(command:string,args?:Record<string,unknown>)=>{
  if(command==='open_startup_file'&&startup){startup=false;return null as T;}
  if(command==='open_dropped_project')return{projectId:'selected',name:'notes.unknown'} as T;
  return invoke<T>(command,args);
 };
 const stop=await installFileAdapter(base.port);await tick();
 base.listeners.get('somnia://os-drop')?.({payload:{token:'native-grant',count:1,directory:false}});
 await until(()=>getOpenChoice()!==null);assert.equal(getOpenChoice()?.suggested,'video');assert.deepEqual(getOpenChoice()?.candidates.map(h=>h.studioId),['code']);
 answerOpenChoice(null);await until(()=>base.closed.length===1);assert.equal(getState().activeStudio,'video');stop();
});
