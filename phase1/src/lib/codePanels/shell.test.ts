import test from 'node:test';import assert from 'node:assert/strict';import {codePanelShell,CODE_PANEL_COMMANDS} from './shell';import {validateStudioShell} from '../shell/panels';import {codePanelSpecs} from './commands';
test('Code panel/inspector manifest validates all hosts and owned commands',()=>{const commands=new Set(codePanelSpecs({ready:()=>true,reveal:()=>{},attribute:()=>{},width:()=>{}}).map(s=>s.id));const hosts=new Set(['code.layers','code.files','code.search','code.components','code.css','code.versions','code.outline','code.responsive','shell.inspector']);const sections=new Set(['code.inspector.design','code.inspector.interactions','code.inspector.source']);assert.deepEqual(validateStudioShell('code',codePanelShell,{commandExists:id=>commands.has(id),hostExists:id=>hosts.has(id),sectionHostExists:id=>sections.has(id)}),[]);assert.deepEqual([...commands].sort(),[...CODE_PANEL_COMMANDS].sort());});

test('Code inspector shows only its empty state while no document is open',async()=>{
 const {evalWhen}=await import('../shell/when');
 assert.equal(codePanelShell.inspector.emptyWhen,'!document');
 assert.equal(evalWhen(codePanelShell.inspector.emptyWhen,{studio:'code',selection:{kind:'none',count:0},busy:false,services:{}}),true);
 assert.equal(evalWhen(codePanelShell.inspector.emptyWhen,{studio:'code',document:{id:'index.html',kind:'html',dirty:false,readOnly:false},selection:{kind:'none',count:0},busy:false,services:{}}),false);
});
