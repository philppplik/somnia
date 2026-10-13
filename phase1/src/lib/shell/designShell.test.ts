import {test} from 'node:test';
import assert from 'node:assert/strict';
import {designStudio,designShell,designMenus,DESIGN_SHELL_COMMANDS,DESIGN_LAYOUT} from '../studios/design';
import {resolveInspectorSections,stackPanels,validateStudioShell} from './panels';
import {effectiveRail} from './railResolver';
import {editRailOverrides,railModel} from '../../store/railActions';
import {hasRailIcon} from './railIcons';
import {validateWhen} from './when';
import '../../components/shell/railIconSet';
import {CATALOGUES} from '../i18n';
const known=new Set<string>([...DESIGN_SHELL_COMMANDS,'project.save']);
const ctx=(sel:'none'|'one'|'many',services:Record<string,boolean>={})=>({studio:'design',selection:{kind:sel,count:sel==='none'?0:sel==='one'?1:3},services,busy:false,data:{}});
test('design manifest passes the shell validator',()=>{
 const sectionHosts=new Set(designShell.inspector!.sections.map(s=>s.component));
 const hosts=new Set(designShell.panels!.map(p=>p.component));
 assert.deepEqual(validateStudioShell('design',designStudio.shellV2!,{commandExists:id=>known.has(id),hostExists:c=>hosts.has(c),sectionHostExists:c=>sectionHosts.has(c),iconExists:hasRailIcon}),[]);
 for(const m of designMenus)assert.ok(known.has(m.command),`menu command ${m.command}`);
});
test('the manifest is pure data and stays a migrated studio',()=>{
 assert.ok(designStudio.shellV2!.panels!.length>=6);assert.equal(designStudio.canvas,'design.canvas');
 assert.equal(JSON.stringify(designStudio.shellV2),JSON.stringify(JSON.parse(JSON.stringify(designStudio.shellV2))),'serialisable');
});
test('every label key, titleKey and tool label exists in all five locales',()=>{
 const keys=new Set<string>();
 for(const p of designShell.panels!)if(p.titleKey)keys.add(p.titleKey);
 for(const r of [...designShell.leftRail!,...designShell.rightRail!])if(r.labelKey)keys.add(r.labelKey);
 for(const s of designShell.inspector!.sections)if(s.titleKey)keys.add(s.titleKey);
 keys.add(designShell.inspector!.emptyKey!);if(designShell.inspector!.titleKey)keys.add(designShell.inspector!.titleKey);
 for(const c of DESIGN_SHELL_COMMANDS)if(c!=='design.getState'&&c!=='design.setTool')keys.add('cmd.'+c);
 for(const [l,c] of Object.entries(CATALOGUES))assert.deepEqual([...keys].filter(k=>!(k in c)),[],l);
});
test('all when expressions parse',()=>{
 for(const p of designShell.panels!)if(p.when)assert.equal(validateWhen(p.when),null);
 for(const r of designShell.leftRail!)if(r.when)assert.equal(validateWhen(r.when),null);
 for(const s of designShell.inspector!.sections)if(s.when)assert.equal(validateWhen(s.when),null);
});
test('inspector sections follow selection and services',()=>{
 const ids=(c:unknown)=>resolveInspectorSections(designShell.inspector!.sections,c).map(s=>s.id);
 assert.deepEqual(ids(ctx('none')),[]);
 assert.deepEqual(ids(ctx('none',{ready:true})),['selection','artboard','project']);
 assert.deepEqual(ids(ctx('one',{ready:true})),['selection','arrange','artboard','project']);
 assert.deepEqual(ids(ctx('many',{ready:true,align:true})),['selection','arrange','artboard','project']);
});
test('default layout opens Layers left and the inspector right',()=>{
 const l=designShell.panels!;
 assert.deepEqual(stackPanels(l,'left',DESIGN_LAYOUT.leftPanels,ctx('none',{ready:true})).map(p=>p.id),['layers']);
 assert.deepEqual(stackPanels(l,'right',DESIGN_LAYOUT.rightPanels,ctx('none',{ready:true})).map(p=>p.id),['inspector']);
});
test('rail defaults: panels first, tools only with an open design, search and versions start in the overflow',()=>{
 const c0=ctx('none'),c1=ctx('none',{ready:true});
 const empty=railModel(designStudio,'left',undefined,c0);const open=railModel(designStudio,'left',undefined,c1);
 assert.deepEqual(empty.visible.map(i=>i.id),['files','layers','artboards','colors']);
 assert.deepEqual(open.visible.map(i=>i.id),['files','layers','artboards','colors','tool-select','tool-hand','tool-rectangle','tool-text','tool-frame']);
 assert.deepEqual(open.overflow.map(i=>i.id),['search','versions']);
});
test('rail customization: reorder, hide, unpin and reset touch one side only',()=>{
 const c=ctx('none',{ready:true});
 const down=editRailOverrides(designStudio,undefined,'moveDown',{side:'left',id:'files'},c)!;
 assert.deepEqual(railModel(designStudio,'left',down,c).visible.slice(0,3).map(i=>i.id),['layers','files','artboards']);
 assert.deepEqual(railModel(designStudio,'right',down,c).visible.map(i=>i.id),['inspector']);
 const hidden=editRailOverrides(designStudio,down,'hide',{side:'left',id:'tool-hand'},c)!;
 assert.ok(railModel(designStudio,'left',hidden,c).hidden.some(i=>i.id==='tool-hand'));
 const pinned=editRailOverrides(designStudio,hidden,'pin',{side:'left',id:'search'},c)!;
 assert.ok(railModel(designStudio,'left',pinned,c).visible.some(i=>i.id==='search'));
 const reset=editRailOverrides(designStudio,pinned,'reset',{side:'left',id:''},c)!;
 assert.deepEqual(railModel(designStudio,'left',reset,c).visible.map(i=>i.id),railModel(designStudio,'left',undefined,c).visible.map(i=>i.id));
 assert.equal(editRailOverrides(designStudio,undefined,'hide',{side:'right',id:'layers'},c),null);
});
test('a tool item still hides without an open design even when pinned',()=>{
 const base=designShell.leftRail!.filter(i=>i.kind==='tool');
 assert.equal(effectiveRail(base,{pinned:base.map(i=>i.id)},{ctx:{services:{}}}).visible.length,0);
});
