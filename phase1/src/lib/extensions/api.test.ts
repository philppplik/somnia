import test from 'node:test';
import assert from 'node:assert/strict';
import {callApi} from './api';
import type {ExtensionManifest} from './types';
const m=(permissions:ExtensionManifest['permissions']):ExtensionManifest=>({id:'acme.hello',name:'Hello',version:'1.0.0',apiVersion:1,permissions,contributes:{commands:[{id:'acme.hello.run',title:'Run',category:'Tools'}],snippets:[],codeThemes:[]}});
const notes:string[]=[],reg:string[]=[];
const deps={files:()=>({'index.html':'<h1>x</h1>'}),selection:()=>({id:'n1',tag:'h1'}),notify:(t:string)=>{notes.push(t);},registerHandler:(id:string)=>{reg.push(id);}};
test('calls are gated by declared permissions',()=>{
 assert.throws(()=>callApi(m([]),'project.readFile',['index.html'],deps),/needs the "project.read"/);
 assert.equal(callApi(m(['project.read']),'project.readFile',['index.html'],deps),'<h1>x</h1>');
 assert.deepEqual(callApi(m(['project.read']),'project.listFiles',[],deps),['index.html']);
 assert.throws(()=>callApi(m(['project.read']),'project.readFile',['__proto__'],deps),/not found/);
 assert.throws(()=>callApi(m(['project.read']),'fs.writeFile',[],deps),/Unknown API method/);
});
test('commands must be declared and notices are capped',()=>{
 assert.throws(()=>callApi(m(['commands']),'commands.register',['evil.cmd'],deps),/declared/);
 callApi(m(['commands']),'commands.register',['acme.hello.run'],deps);assert.deepEqual(reg,['acme.hello.run']);
 callApi(m(['ui.notify']),'ui.notify',['x'.repeat(500)],deps);assert.equal(notes[0].length,200);
});
