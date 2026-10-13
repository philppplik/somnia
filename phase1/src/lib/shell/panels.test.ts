import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PanelDef,StudioShellDef} from './types';
import {dockedPanels,railPanels,stackPanels,validateStudioShell} from './panels';
import {createPanelStateStore} from '../../store/panelStateStore';
const P=(o:Partial<PanelDef>&{id:string}):PanelDef=>({title:o.id,component:`x.${o.id}`,side:'right',...o});
const sel=(kind:string)=>({studio:'x',selection:{kind,count:kind==='none'?0:1}});
test('stackPanels: opened rail panels in layout order, unavailable dropped, docked appended while when holds',()=>{
 const panels=[P({id:'a'}),P({id:'b',when:"selection.kind != 'none'"}),P({id:'d',placement:'docked',when:"selection.kind == 'one'"}),P({id:'l',side:'left'})];
 assert.deepEqual(stackPanels(panels,'right',['b','a'],sel('none')).map(p=>p.id),['a']);
 assert.deepEqual(stackPanels(panels,'right',['b','a'],sel('one')).map(p=>p.id),['b','a','d']);
 assert.deepEqual(stackPanels(panels,'right',['b','a','l'],sel('many')).map(p=>p.id),['b','a']);
 assert.deepEqual(railPanels(panels,'right',sel('one')).map(p=>p.id),['a','b']);
 assert.deepEqual(dockedPanels(panels,'right',sel('many')).map(p=>p.id),[]);
});
test('validateStudioShell accepts a consistent manifest',()=>{
 const def:StudioShellDef={
  panels:[P({id:'outline',side:'left',commands:['documents.outline.toggle']}),P({id:'inspector',when:"selection.kind != 'none'"})],
  leftRail:[{id:'outline',icon:'List',label:'Outline',kind:'panel',panel:'outline',order:10}],
  rightRail:[{id:'inspector',icon:'Sliders',label:'Inspector',kind:'panel',panel:'inspector',order:10},{id:'save',icon:'Save',label:'Save',kind:'command',command:'project.save',order:20}],
  defaultLayout:{leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:320,leftPanels:['outline'],rightPanels:['inspector']},
 };
 assert.deepEqual(validateStudioShell('documents',def,{commandExists:()=>true,hostExists:()=>true,iconExists:()=>true}),[]);
});
test('validateStudioShell reports broken references, duplicates, bad when and wrong side',()=>{
 const def:StudioShellDef={
  panels:[P({id:'a',when:'selection.kind =='}),P({id:'a'}),P({id:'dock',side:'left',placement:'docked'}),P({id:'r'})],
  leftRail:[{id:'x',icon:'Nope',label:'x',kind:'panel',panel:'ghost',order:1},{id:'y',icon:'List',label:'y',kind:'panel',panel:'r',order:2},{id:'z',icon:'List',label:'z',kind:'panel',panel:'dock',order:3},{id:'c',icon:'List',label:'c',kind:'command',order:4},{id:'t',icon:'List',label:'t',kind:'tool',tool:'none',order:5}],
 };
 const p=validateStudioShell('s',def,{iconExists:i=>i!=='Nope',hostExists:()=>false}).join('\n');
 for(const m of['duplicate panel id "a"','when: unexpected end','unknown panel "ghost"','icon "Nope" is unknown','lives on the right','docked panel "dock"','needs a command','unknown tool "none"','host "x.a" is not registered'])assert.ok(p.includes(m),m+'\n'+p);
});
test('panel state store persists per key and ignores bad storage',()=>{
 const data=new Map<string,string>();const st={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 const a=createPanelStateStore(st);let n=0;a.subscribe(()=>n++);
 assert.equal(a.get('documents.styles',{tab:'page'}).tab,'page');
 a.set('documents.styles',{tab:'text'});a.set('documents.styles',{tab:'text'});assert.equal(n,1);
 assert.equal(createPanelStateStore(st).get('documents.styles',{tab:'page'}).tab,'text');
 data.set('somnia.panelState.v1','not json');assert.equal(createPanelStateStore(st).get('k',1),1);
});
