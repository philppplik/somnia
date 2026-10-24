import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codeStudio} from '../studios/code';
import {CODE_LEFT_RAIL,CODE_RIGHT_RAIL,CODE_SHELL_LAYOUT} from '../studios/codeRail';
import {codePanels,codeInspector} from '../codePanels/shell';
import {resolveInspectorSections,stackPanels,validateStudioShell} from './panels';
import {effectiveRail} from './railResolver';
import {editRailOverrides,railModel} from '../../store/railActions';
import {hasRailIcon,resolveRailIcon,RAIL_FALLBACK_ICON} from './railIcons';
import '../../components/shell/railIconSet';
import {CATALOGUES} from '../i18n';

const shell=codeStudio.shellV2!;
const ctx=(over:Record<string,unknown>={})=>({studio:'code',selection:{kind:'none',count:0},busy:false,services:{},...over});
const knownPanelHosts=new Set([...codePanels.map(p=>p.component)]);
const knownSectionHosts=new Set(codeInspector.sections.map(s=>s.component));

test('code manifest wires panels, inspector, rails and layout',()=>{
 assert.equal(shell.panels,codePanels);
 assert.equal(shell.inspector,codeInspector);
 assert.equal(shell.leftRail,CODE_LEFT_RAIL);
 assert.equal(shell.rightRail,CODE_RIGHT_RAIL);
 assert.equal(shell.defaultLayout,CODE_SHELL_LAYOUT);
});

test('code studio shell passes the validator',()=>{
 const problems=validateStudioShell('code',shell,{commandExists:()=>true,hostExists:c=>knownPanelHosts.has(c),sectionHostExists:c=>knownSectionHosts.has(c),iconExists:hasRailIcon});
 assert.deepEqual(problems,[]);
});

test('left rail keeps the legacy order and appends the new panels',()=>{
 assert.deepEqual(CODE_LEFT_RAIL.map(i=>i.id),['layers','files','search','components','css','versions','responsive','outline','publish','publish-log']);
 assert.deepEqual(CODE_RIGHT_RAIL.map(i=>i.id),['inspector']);
 for(const i of [...CODE_LEFT_RAIL,...CODE_RIGHT_RAIL]){assert.equal(i.kind,'panel');assert.equal(i.panel,i.id);}
});

test('every rail item points at a declared panel on its own side',()=>{
 for(const side of ['left','right'] as const){
  const items=side==='left'?CODE_LEFT_RAIL:CODE_RIGHT_RAIL;
  const panels=codePanels.filter(p=>p.side===side);
  assert.deepEqual(items.map(i=>i.id).sort(),panels.map(p=>p.id).sort(),`${side} rail covers its panels`);
 }
});

test('rail icons resolve to real glyphs, never the fallback',()=>{
 for(const i of [...CODE_LEFT_RAIL,...CODE_RIGHT_RAIL]){
  assert.ok(hasRailIcon(i.icon),`unknown rail icon "${i.icon}"`);
  assert.notEqual(resolveRailIcon(i.icon),RAIL_FALLBACK_ICON,`"${i.icon}" falls back`);
 }
});

test('customization defaults: everything pinned, declared order, empty overflow',()=>{
 const eff=effectiveRail(CODE_LEFT_RAIL,undefined,{ctx:ctx()});
 assert.deepEqual(eff.visible.map(i=>i.id),CODE_LEFT_RAIL.map(i=>i.id));
 assert.equal(eff.overflow.length,0);
});

test('default layout opens Layers left and the inspector right',()=>{
 assert.deepEqual(stackPanels(codePanels,'left',CODE_SHELL_LAYOUT.leftPanels,ctx()).map(p=>p.id),['layers']);
 assert.deepEqual(stackPanels(codePanels,'right',CODE_SHELL_LAYOUT.rightPanels,ctx()).map(p=>p.id),['inspector']);
});

test('inspector sections resolve in declaration order',()=>{
 const one=ctx({selection:{kind:'one',count:1}});
 assert.deepEqual(resolveInspectorSections(codeInspector.sections,ctx()).map(s=>s.id),['design','source','publish-target','publish-framework','publish-dryrun']);
 assert.deepEqual(resolveInspectorSections(codeInspector.sections,one).map(s=>s.id),['design','interactions','source','publish-target','publish-framework','publish-dryrun']);
 assert.deepEqual(resolveInspectorSections(codeInspector.sections,one).filter(s=>s.defaultCollapsed).map(s=>s.id),['source','publish-target','publish-framework','publish-dryrun']);
});

test('rail customization edits one side without touching the other',()=>{
 const c=ctx();
 const down=editRailOverrides(codeStudio,undefined,'moveDown',{side:'left',id:'layers'},c)!;
 assert.deepEqual(railModel(codeStudio,'left',down,c).visible.map(i=>i.id),['files','layers','search','components','css','versions','responsive','outline','publish','publish-log']);
 assert.deepEqual(railModel(codeStudio,'right',down,c).visible.map(i=>i.id),['inspector']);
 const hidden=editRailOverrides(codeStudio,down,'hide',{side:'left',id:'responsive'},c)!;
 const m=railModel(codeStudio,'left',hidden,c);
 assert.deepEqual(m.hidden.map(i=>i.id),['responsive']);
 assert.ok(!m.visible.some(i=>i.id==='responsive'));
 const unpinned=editRailOverrides(codeStudio,hidden,'unpin',{side:'left',id:'outline'},c)!;
 assert.deepEqual(railModel(codeStudio,'left',unpinned,c).overflow.map(i=>i.id),['outline']);
 const moved=editRailOverrides(codeStudio,undefined,'move',{side:'left',id:'versions',to:0},c)!;
 assert.equal(railModel(codeStudio,'left',moved,c).visible[0].id,'versions');
 assert.equal(editRailOverrides(codeStudio,undefined,'moveUp',{side:'left',id:'layers'},c),null);
 assert.equal(editRailOverrides(codeStudio,undefined,'hide',{side:'right',id:'layers'},c),null,'left ids are not editable on the right rail');
 const reset=editRailOverrides(codeStudio,hidden,'reset',{side:'left',id:''},c)!;
 assert.deepEqual(railModel(codeStudio,'left',reset,c).visible.map(i=>i.id),CODE_LEFT_RAIL.map(i=>i.id));
});

test('rail and inspector strings exist in all five catalogues',()=>{
 const keys=[...CODE_LEFT_RAIL,...CODE_RIGHT_RAIL].map(i=>i.labelKey!)
  .concat(['code.inspector','code.inspector.empty',...codeInspector.sections.map(s=>s.titleKey!)]);
 assert.ok(keys.length>=13&&keys.every(Boolean));
 for(const key of keys)for(const [locale,cat] of Object.entries(CATALOGUES))
  assert.ok((cat as Record<string,string>)[key]?.trim(),`${locale} lacks ${key}`);
});
