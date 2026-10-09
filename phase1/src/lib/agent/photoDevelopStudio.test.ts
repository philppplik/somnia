import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoDevelopRegistry,parsePhotoSettings,serializePhotoSettings,photoDevelopAdapter} from './photoStudio';
import {photoDevelopManifest} from '../photos/manifest';
import {neutralDevelop} from '../photos/registry';
import {DocumentRegistry} from './documentCore';
import {addMediaFile,findMedia,closeMedia} from '../media';
import {ensureDevelopSession,configureDevelopSession,updateDevelopSettings,historyDevelop,forgetDevelopSession,getDevelopSession,developRevision} from '../photos/session';
import {getPhotoDevelop,applyPhotoDevelop,undoPhotoDevelop,photoDevelopFiles,forgetPhotoDevelop} from './photoDevelopWorkspace';
const signal=()=>new AbortController().signal;
const ctx={files:()=>({}),propose:async()=>{throw Error('not used');}};
test('Photo settings parser rejects shapes, unknown keys and non-finite/range violations',()=>{
 for(const text of ['bad','[]','null','2','{"x":1}','{"exposure":null}','{"exposure":"1"}','{"exposure":3.01}','{"contrast":101}','{"saturation":-101}','{"exposure":1e999}'])assert.throws(()=>parsePhotoSettings(text));
 assert.throws(()=>parsePhotoSettings(' '.repeat(4097)),/size/);assert.deepEqual(parsePhotoSettings('{"exposure":1}'),{...neutralDevelop,exposure:1});
 assert.throws(()=>serializePhotoSettings({...neutralDevelop,exposure:Infinity}));
 assert.throws(()=>serializePhotoSettings({...neutralDevelop,bogus:undefined} as any));
 assert.doesNotThrow(()=>photoDevelopAdapter.validate(serializePhotoSettings(neutralDevelop)));
});
test('Develop registry metadata only, partial proposal staged but not applied, whitelist and cancellation',async()=>{
 const docs=new DocumentRegistry([photoDevelopAdapter]);const text=serializePhotoSettings({...neutralDevelop,contrast:5});docs.sync({'a.png':text},1);const staged:string[]=[];
 const r=createPhotoDevelopRegistry({snapshot:()=>docs.snapshot('a.png'),info:()=>({name:'a.png',mime:'image/png',width:200,height:100,sourceURL:'blob:must-not-leak',exif:{gps:1}} as any),propose:after=>staged.push(after)});
 assert.deepEqual(r.definitions().map(x=>x.name),photoDevelopManifest.agent.tools);assert.equal(r.level('photo_inspect'),'read');assert.equal(r.level('photo_propose_settings'),'propose');
 const result=await r.run('photo_inspect',{},ctx,signal());const info=JSON.parse(result);assert.deepEqual(info.image,{name:'a.png',mime:'image/png',width:200,height:100});assert.equal(info.settings.contrast,5);assert.equal(info.pixelsDisclosed,false);assert.ok(!/blob:|data:|exif|gps/.test(result));
 await r.run('photo_propose_settings',{settings:{exposure:1}},ctx,signal());assert.deepEqual(parsePhotoSettings(staged[0]),{exposure:1,contrast:5,saturation:0});assert.equal(docs.snapshot('a.png').text,text);
 for(const args of [{settings:{}},{settings:[]},{settings:null},{settings:{foo:undefined}},{settings:{exposure:NaN}},{settings:{exposure:Infinity}},{settings:{exposure:4}},{settings:{saturation:101}},{settings:{exposure:1},path:'other.png'},{settings:{__proto__:null,foo:1}}])await assert.rejects(r.run('photo_propose_settings',args,ctx,signal()));
 await assert.rejects(r.run('photo_inspect',{upload:true},ctx,signal()),/Unexpected/);await assert.rejects(r.run('photo_propose_settings',{settings:{exposure:2}},ctx,AbortSignal.abort()));assert.equal(staged.length,1);
 const wrong=createPhotoDevelopRegistry({snapshot:()=>({...docs.snapshot('a.png'),ref:{...docs.snapshot('a.png').ref,adapter:'photo-stack-v1'}}),info:()=>null,propose:()=>{}});await assert.rejects(wrong.run('photo_inspect',{},ctx,signal()),/adapter/);
});
async function open(name:string){const blob=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});await addMediaFile(blob,name);const m=findMedia(name)!;ensureDevelopSession(m.url);configureDevelopSession(m.url,{name,mime:'image/png',width:64,height:48},true);return m;}
test('session acceptance and undo guard protects manual ABA edits and newest AI origin',async()=>{
 const m=await open('develop-ai.png');try{
 assert.deepEqual(Object.keys(photoDevelopFiles()),['develop-ai.png']);const before=photoDevelopFiles()[m.name];const revision=developRevision();
 applyPhotoDevelop(m.name,'{"exposure":1}','ai:1');assert.equal(getPhotoDevelop(m.name)!.session.now.exposure,1);assert.ok(developRevision()>revision);
 assert.throws(()=>applyPhotoDevelop(m.name,'{"exposure":99}','ai:bad'));assert.equal(getPhotoDevelop(m.name)!.session.now.exposure,1);
 applyPhotoDevelop(m.name,'{"exposure":2}','ai:2');assert.throws(()=>undoPhotoDevelop(m.name,'ai:1'),/later AI/);undoPhotoDevelop(m.name,'ai:2');undoPhotoDevelop(m.name,'ai:1');assert.equal(photoDevelopFiles()[m.name],before);
 applyPhotoDevelop(m.name,'{"exposure":1}','ai:3');updateDevelopSettings(m.url,{...neutralDevelop,exposure:2});updateDevelopSettings(m.url,{...neutralDevelop,exposure:1});assert.throws(()=>undoPhotoDevelop(m.name,'ai:3'),/Manual edits/);
 // A new accepted edit can be undone, but cannot erase the manual ABA history below it.
 applyPhotoDevelop(m.name,'{"exposure":3}','ai:4');undoPhotoDevelop(m.name,'ai:4');assert.throws(()=>undoPhotoDevelop(m.name,'ai:3'),/Manual edits/);
 historyDevelop(m.url,false);historyDevelop(m.url,true);assert.throws(()=>undoPhotoDevelop(m.name,'ai:3'),/Manual edits/);
 }finally{forgetDevelopSession(m.url);forgetPhotoDevelop(m.name);closeMedia(m.name);}
});
test('source replacement and not-ready session cannot accept/undo',async()=>{
 const m=await open('replace-ai.png');applyPhotoDevelop(m.name,'{"contrast":20}','ai:1');forgetDevelopSession(m.url);await addMediaFile(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])]),m.name);const replacement=findMedia(m.name)!;
 try{assert.notEqual(replacement.url,m.url);assert.equal(getPhotoDevelop(m.name),null);assert.throws(()=>applyPhotoDevelop(m.name,'{"exposure":1}','ai:new'),/loading/);ensureDevelopSession(replacement.url);configureDevelopSession(replacement.url,{name:m.name,mime:'image/png',width:64,height:48},true);assert.throws(()=>undoPhotoDevelop(m.name,'ai:1'),/replacement/);assert.deepEqual(getDevelopSession(replacement.url)!.now,neutralDevelop);}finally{forgetDevelopSession(replacement.url);forgetPhotoDevelop(m.name);closeMedia(m.name);}
});
import {diffPhotoDevelop} from './photoDevelopReview';
test('review diff lists exact changed controls without pixels or invented preview',()=>{const before=serializePhotoSettings(neutralDevelop);assert.deepEqual(diffPhotoDevelop(before,before),[]);assert.deepEqual(diffPhotoDevelop(before,'{"exposure":1,"saturation":-20}'),[{id:'exposure',before:'0',after:'1'},{id:'saturation',before:'0',after:'-20'}]);assert.throws(()=>diffPhotoDevelop(before,'{"contrast":999}'));});
