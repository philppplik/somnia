import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentsStudio,documentsShell,DOCUMENTS_COMMANDS,DOCUMENTS_LAYOUT} from '../studios/documents';
import {resolveInspectorSections,stackPanels,validateStudioShell} from './panels';
import {effectiveRail} from './railResolver';
import {editRailOverrides,railModel} from '../../store/railActions';
import {registerRailIcons,hasRailIcon,resolveRailIcon,RAIL_FALLBACK_ICON} from './railIcons';
import '../../components/shell/railIconSet';
const known=new Set<string>([...DOCUMENTS_COMMANDS,'project.save']);
const ctx=(sel:'none'|'one',services:Record<string,boolean>={})=>({studio:'documents',selection:{kind:sel,count:sel==='none'?0:1},services,data:{block:2}});
test('documents manifest passes the shell validator',()=>{
 const sectionHosts=new Set(documentsShell.inspector!.sections.map(s=>s.component));
 const hosts=new Set([...documentsShell.panels!.map(p=>p.component)]);
 assert.deepEqual(validateStudioShell('documents',documentsShell,{commandExists:id=>known.has(id),hostExists:c=>hosts.has(c),sectionHostExists:c=>sectionHosts.has(c),iconExists:hasRailIcon}),[]);
});
test('inspector sections follow selection and services',()=>{
 const ids=(c:unknown)=>resolveInspectorSections(documentsShell.inspector!.sections,c).map(s=>s.id);
 assert.deepEqual(ids(ctx('none')),['document']);
 assert.deepEqual(ids(ctx('one',{ready:true})),['document','selection','text']);
 assert.deepEqual(ids(ctx('one',{ready:true,risks:true})),['document','selection','text','risks']);
});
test('default layout shows Files left and the inspector right',()=>{
 const l=documentsShell.panels!;
 assert.deepEqual(stackPanels(l,'left',DOCUMENTS_LAYOUT.leftPanels,ctx('none')).map(p=>p.id),['files']);
 assert.deepEqual(stackPanels(l,'right',DOCUMENTS_LAYOUT.rightPanels,ctx('none')).map(p=>p.id),['inspector']);
});
test('rail customization edits one side without touching the other',()=>{
 const c=ctx('none');
 const down=editRailOverrides(documentsStudio,undefined,'moveDown',{side:'left',id:'files'},c)!;
 assert.deepEqual(railModel(documentsStudio,'left',down,c).visible.map(i=>i.id),['pages','files','outline','find','search','versions']);
 assert.deepEqual(railModel(documentsStudio,'right',down,c).visible.map(i=>i.id),['inspector']);
 const hidden=editRailOverrides(documentsStudio,down,'hide',{side:'left',id:'pages'},c)!;
 const m=railModel(documentsStudio,'left',hidden,c);
 assert.deepEqual(m.visible.map(i=>i.id),['files','outline','find','search','versions']);assert.deepEqual(m.hidden.map(i=>i.id),['pages']);
 const unpinned=editRailOverrides(documentsStudio,hidden,'unpin',{side:'left',id:'versions'},c)!;
 assert.deepEqual(railModel(documentsStudio,'left',unpinned,c).overflow.map(i=>i.id),['versions']);
 const moved=editRailOverrides(documentsStudio,undefined,'move',{side:'left',id:'versions',to:0},c)!;
 assert.equal(railModel(documentsStudio,'left',moved,c).visible[0].id,'versions');
 assert.equal(editRailOverrides(documentsStudio,undefined,'moveUp',{side:'left',id:'files'},c),null);
 assert.equal(editRailOverrides(documentsStudio,undefined,'hide',{side:'right',id:'pages'},c),null);
 const reset=editRailOverrides(documentsStudio,hidden,'reset',{side:'left',id:''},c)!;
 assert.deepEqual(railModel(documentsStudio,'left',reset,c).visible.length,6);
});
test('moving a right item keeps the left order',()=>{
 const c=ctx('none');
 const a=editRailOverrides(documentsStudio,undefined,'moveDown',{side:'left',id:'files'},c)!;
 const b=editRailOverrides(documentsStudio,a,'unpin',{side:'right',id:'inspector'},c)!;
 assert.deepEqual(railModel(documentsStudio,'left',b,c).visible.map(i=>i.id)[0],'pages');
});
test('rail icon registry falls back and is first-wins',()=>{
 assert.equal(resolveRailIcon('Nope'),RAIL_FALLBACK_ICON);assert.equal(resolveRailIcon(undefined),RAIL_FALLBACK_ICON);
 const A=()=>null,B=()=>null;registerRailIcons({TestA:A as never});registerRailIcons({TestA:B as never});assert.equal(resolveRailIcon('TestA'),A);
 registerRailIcons({TestA:B as never},true);assert.equal(resolveRailIcon('TestA'),B);
});
test('effectiveRail still hides when() items even if pinned',()=>{
 const base=[{id:'a',icon:'Files',label:'a',kind:'panel' as const,panel:'a',order:1,when:'services.x'}];
 assert.equal(effectiveRail(base,{pinned:['a']},{ctx:{services:{}}}).visible.length,0);
});
