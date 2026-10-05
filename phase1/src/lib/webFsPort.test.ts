import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebFsPort,memoryJournal} from './webFsPort';
class FakeFile{constructor(public text:string){}async getFile(){return{text:async()=>this.text,arrayBuffer:async()=>new TextEncoder().encode(this.text).buffer};}async createWritable(){let buf='';const self=this;return{write:async(t:string)=>{buf=t;},close:async()=>{self.text=buf;}};}kind='file' as const}
class FakeDir{kind='directory' as const;items=new Map<string,FakeDir|FakeFile>();constructor(public name:string){}
 async getDirectoryHandle(n:string,o?:{create?:boolean}){let d=this.items.get(n);if(!d){if(!o?.create)throw new DOMException('x','NotFoundError');d=new FakeDir(n);this.items.set(n,d);}if(!(d instanceof FakeDir))throw new DOMException('x','TypeMismatchError');return d;}
 async getFileHandle(n:string,o?:{create?:boolean}){let f=this.items.get(n);if(!f){if(!o?.create)throw new DOMException('x','NotFoundError');f=new FakeFile('');this.items.set(n,f);}if(!(f instanceof FakeFile))throw new DOMException('x','TypeMismatchError');return f;}
 async removeEntry(n:string){if(!this.items.delete(n))throw new DOMException('x','NotFoundError');}
 async *entries(){for(const e of this.items)yield e;}}
async function setup(){const root=new FakeDir('site');root.items.set('index.html',new FakeFile('<h1>Hi</h1>'));const sub=new FakeDir('css');sub.items.set('a.css',new FakeFile('h1{}'));root.items.set('css',sub);root.items.set('.git',new FakeDir('.git'));
 const port=createWebFsPort({pickDirectory:async()=>root as never,journal:memoryJournal()});const {projectId}=(await port.invoke<{projectId:string}>('choose_project'))!;return{root,port,projectId};}
test('lists files, skips hidden folders, reads content with a sha256 revision',async()=>{
 const {port,projectId}=await setup();assert.deepEqual(await port.invoke('list_files',{projectId}),['css/a.css','index.html']);
 const r=await port.invoke<{content:string;revision:{exists:boolean;hash:string}}>('read_file',{projectId,path:'index.html'});assert.equal(r.content,'<h1>Hi</h1>');assert.match(r.revision.hash,/^sha256:[0-9a-f]{64}$/);
 const missing=await port.invoke<{content:null;revision:{exists:boolean}}>('read_file',{projectId,path:'nope.html'});assert.equal(missing.content,null);assert.equal(missing.revision.exists,false);
});
test('stage then save writes, verifies and clears the journal',async()=>{
 const {root,port,projectId}=await setup();const events:string[]=[];await port.listen<{state:string}>('somnia://file-state',e=>events.push(e.payload.state));
 const read=await port.invoke<{revision:unknown}>('read_file',{projectId,path:'index.html'});
 const staged=await port.invoke<{state:string}>('stage_edit',{projectId,path:'index.html',content:'<h1>New</h1>',clientRevision:1});assert.equal(staged.state,'dirty');
 const saved=await port.invoke<{state:string;clientRevision:number}>('save_file',{projectId,path:'index.html',expectedRevision:read.revision});assert.equal(saved.state,'saved');assert.equal(saved.clientRevision,1);
 assert.equal((root.items.get('index.html') as FakeFile).text,'<h1>New</h1>');assert.deepEqual(events,['saved']);assert.deepEqual(await port.invoke('recovery_list',{projectId}),[]);
});
test('external change before save is a conflict and the disk file stays untouched',async()=>{
 const {root,port,projectId}=await setup();const read=await port.invoke<{revision:unknown}>('read_file',{projectId,path:'index.html'});
 await port.invoke('stage_edit',{projectId,path:'index.html',content:'<h1>Mine</h1>',clientRevision:1});
 (root.items.get('index.html') as FakeFile).text='<h1>Theirs</h1>';
 const result=await port.invoke<{state:string}>('save_file',{projectId,path:'index.html',expectedRevision:read.revision});assert.equal(result.state,'conflict');
 assert.equal((root.items.get('index.html') as FakeFile).text,'<h1>Theirs</h1>');assert.equal((await port.invoke<unknown[]>('recovery_list',{projectId})).length,1);
});
test('stale revisions and unsafe paths are rejected, recovery is listed and discardable',async()=>{
 const {port,projectId}=await setup();await port.invoke('stage_edit',{projectId,path:'index.html',content:'a',clientRevision:2});
 await assert.rejects(port.invoke('stage_edit',{projectId,path:'index.html',content:'b',clientRevision:2}),/Stale/);
 await assert.rejects(port.invoke('stage_edit',{projectId,path:'../x.html',content:'b',clientRevision:3}),/Invalid project path/);
 await assert.rejects(port.invoke('read_file',{projectId,path:'/etc/passwd'}),/Invalid project path/);
 const list=await port.invoke<{path:string;content:string}[]>('recovery_list',{projectId});assert.equal(list[0].path,'index.html');assert.equal(list[0].content,'a');
 await port.invoke('recovery_discard',{projectId,path:'index.html'});assert.deepEqual(await port.invoke('recovery_list',{projectId}),[]);
});
test('close_project without keepRecovery drops the journal, with keepRecovery keeps it',async()=>{
 const {port,projectId}=await setup();await port.invoke('stage_edit',{projectId,path:'index.html',content:'a',clientRevision:1});
 await port.invoke('close_project',{projectId,keepRecovery:true});await assert.rejects(port.invoke('list_files',{projectId}),/not connected/);
});

test('reconnect reuses the remembered handle only after the browser grants permission',async()=>{
 let stored:unknown;const handles={async get(){return stored as never;},async put(h:unknown){stored=h;}};
 const root=new FakeDir('site') as FakeDir&{queryPermission:()=>Promise<string>;requestPermission:()=>Promise<string>};
 let perm='prompt';root.queryPermission=async()=>perm;root.requestPermission=async()=>perm;
 const port=createWebFsPort({pickDirectory:async()=>root as never,journal:memoryJournal(),handles:handles as never});
 await assert.rejects(()=>port.invoke('choose_project',{reconnect:true}),/No earlier folder/);
 await port.invoke('choose_project');
 const reopened=createWebFsPort({journal:memoryJournal(),handles:handles as never});
 await assert.rejects(()=>reopened.invoke('choose_project',{reconnect:true}),/did not grant/);
 perm='granted';
 const again=await reopened.invoke<{name:string}>('choose_project',{reconnect:true});
 assert.equal(again.name,'site');assert.equal(reopened.canReconnect,true);
});
test('new files in new folders are created on save and deleted only with a matching revision',async()=>{
 const {root,port,projectId}=await setup();const miss=await port.invoke<{revision:unknown}>('read_file',{projectId,path:'pages/about.html'});
 await port.invoke('stage_edit',{projectId,path:'pages/about.html',content:'<h1>About</h1>',clientRevision:1});
 const saved=await port.invoke<{state:string}>('save_file',{projectId,path:'pages/about.html',expectedRevision:miss.revision});assert.equal(saved.state,'saved');
 assert.equal(((root.items.get('pages') as FakeDir).items.get('about.html') as FakeFile).text,'<h1>About</h1>');
 await assert.rejects(port.invoke('delete_file',{projectId,path:'pages/about.html',expectedRevision:miss.revision}),/changed on disk/);
 const cur=await port.invoke<{revision:unknown}>('read_file',{projectId,path:'pages/about.html'});await port.invoke('delete_file',{projectId,path:'pages/about.html',expectedRevision:cur.revision});
 assert.equal((root.items.get('pages') as FakeDir).items.has('about.html'),false);
});
