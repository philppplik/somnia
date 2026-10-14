import test from 'node:test';import assert from 'node:assert/strict';
import {EditorProject} from '@somnia/editor-core';
import {visionApplication} from './localVisionApplication';
import type {DocumentSnapshot} from './documentCore';
const snap=(path:string,text:string):DocumentSnapshot=>({ref:{documentId:'x',path,studioKind:'code',adapter:'code-v1',revision:1},text});
test('description is appended as inert text, including longer fence runs',()=>{
 const base=snap('notes.md','# Notes');const text='<script>alert(1)</script>\n```\n![image](https://bad.invalid)';
 assert.equal(visionApplication(base,text,'text',[],null),'# Notes\n\n````text\n'+text+'\n````\n');assert.equal(base.text,'# Notes');
});
test('parser-backed alt changes only selected image, preserves source and quotes safely',()=>{
 const base=snap('index.html','<img src="a.jpg" alt="old"><img src="b.jpg" alt="keep">');const project=new EditorProject({[base.ref.path]:base.text});const nodes=project.tree(base.ref.path);const first=nodes.find(n=>n.tag==='img')!;
 const after=visionApplication(base,'A "red" <square>','alt',nodes,first.id);const parsed=new EditorProject({[base.ref.path]:after}).tree(base.ref.path);
 assert.equal(parsed[0].attrs.alt,'A "red" <square>');assert.equal(parsed[1].attrs.alt,'keep');assert.equal(parsed[0].attrs.src,'a.jpg');assert.equal(base.text.includes('alt="old"'),true);
});
test('unsupported destinations, locked nodes, empty and binary descriptions are refused',()=>{
 assert.throws(()=>visionApplication(snap('a.ts','x'),'description','text',[],null));
 for(const text of ['', 'x\0', 'x'.repeat(12001)])assert.throws(()=>visionApplication(snap('a.md','x'),text,'text',[],null));
 const b=snap('a.html','<img src="x">');const nodes=new EditorProject({[b.ref.path]:b.text}).tree(b.ref.path);nodes[0].locked=true;assert.throws(()=>visionApplication(b,'test','alt',nodes,nodes[0].id));
 assert.throws(()=>visionApplication(b,'test','alt',nodes,'missing'));
});
test('review uses real native proposal acceptance, stale guard and editor undo',async()=>{
 const {connectEditorProject,getState,applyOperations}=await import('../../store/appStore');const {realCore,stageLocalVisionResult}=await import('./panelBridge');
 const project=new EditorProject({'notes.md':'# Notes'});connectEditorProject(project);
 const p=stageLocalVisionResult('notes.md','A red square','text','fixture');assert.equal(getState().files['notes.md'],'# Notes');assert.equal(p.native?.state,'review');
 await realCore.applyProposal(p.id);assert.ok(getState().files['notes.md'].includes('A red square'));await realCore.revertProposal(p.id);assert.equal(getState().files['notes.md'],'# Notes');
 const stale=stageLocalVisionResult('notes.md','A circle','text','fixture');applyOperations([{type:'replaceSource',file:'notes.md',text:'Manual edit'}]);
 await assert.rejects(realCore.applyProposal(stale.id),/changed/);assert.equal(getState().files['notes.md'],'Manual edit');await realCore.rejectProposal(stale.id);
 realCore.clear?.();
});
test('application errors use stable translated target reasons, unknown errors stay generic',async()=>{
 const {visionApplicationErrorKey}=await import('./localVisionApplication');assert.equal(visionApplicationErrorKey('Text insertion supports Markdown source only.'),'local.apply.error.markdown');assert.equal(visionApplicationErrorKey('secret filesystem detail'),'local.apply.error.failed');
});
