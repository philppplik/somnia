import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveInspectorSections,stackPanels,validateStudioShell} from '../shell/panels';
import {effectiveRail,railEdits,sanitizeOverrides,EMPTY_RAIL_OVERRIDES} from '../shell/railResolver';
import {editRailOverrides,railModel} from '../../store/railActions';
import {hasRailIcon,resolveRailIcon,RAIL_FALLBACK_ICON} from '../shell/railIcons';
import '../../components/shell/railIconSet';
import {listCommands} from '../commands';
import {registerSheetsCommands} from '../sheets/commands';
import {sheetsPanelDefs,sheetsInspectorDef} from '../sheets/panels';
import {CATALOGUES} from '../i18n';
import {SHEETS_GLOBAL_PANELS,SHEETS_LAYOUT,SHEETS_LEFT_RAIL,SHEETS_RIGHT_RAIL,SHEETS_RAIL_ICONS,sheetsShellV2} from './sheetsRail';
import {sheetsStudio} from './sheets';

const panels=sheetsShellV2.panels!;
const ctx=(document:boolean,services:Record<string,boolean>={})=>({studio:'sheets',selection:{kind:'none' as const,count:0},services,
 ...(document?{document:{id:'w1',kind:'xlsx',dirty:false,readOnly:false}}:{})});

test('sheets shellV2 passes the studio shell validator against the real command registry',()=>{
 const off=registerSheetsCommands();
 try{
  const known=new Set(listCommands().map(c=>c.id));
  const hosts=new Set([...panels.map(p=>p.component)]);
  const sectionHosts=new Set(sheetsInspectorDef.sections.map(s=>s.component));
  const problems=validateStudioShell('sheets',sheetsShellV2,{commandExists:id=>known.has(id),hostExists:c=>hosts.has(c)||c.startsWith('code.'),sectionHostExists:c=>sectionHosts.has(c),iconExists:hasRailIcon});
  assert.deepEqual(problems,[]);
 }finally{off();}
});

test('manifest wiring: sheets studio exposes shellV2; legacy v1 shell stays untouched',()=>{
 assert.equal(sheetsStudio.shellV2,sheetsShellV2);
 assert.equal(sheetsShellV2.inspector,sheetsInspectorDef);
 assert.deepEqual(sheetsStudio.shell.leftRail.map(i=>i.id),['files','search','versions']);
});

test('panel set: sheets defs plus the studio-agnostic globals, ids unique, sides consistent',()=>{
 assert.deepEqual(panels.filter(p=>SHEETS_GLOBAL_PANELS.includes(p)).length,3);
 for(const g of SHEETS_GLOBAL_PANELS){assert.equal(g.side,'left');assert.ok(g.component.startsWith('code.'));}
 for(const p of sheetsPanelDefs.filter(p=>p.component!=='shell.inspector'))
  assert.equal(p.component,`sheets.${p.id}`,`host naming convention for ${p.id}`);
 assert.equal(new Set(panels.map(p=>p.id)).size,panels.length,'no duplicate panel ids');
 // Every rail panel is reachable: rail item on the same side or open by default.
 for(const p of panels.filter(p=>(p.placement??'rail')==='rail')){
  const items=p.side==='left'?SHEETS_LEFT_RAIL:SHEETS_RIGHT_RAIL;
  const layout=p.side==='left'?SHEETS_LAYOUT.leftPanels:SHEETS_LAYOUT.rightPanels;
  assert.ok(items.some(i=>i.kind==='panel'&&i.panel===p.id)||layout.includes(p.id),`panel ${p.id} is reachable`);
 }
});

test('every rail icon resolves through the registry (no fallback glyph)',()=>{
 for(const it of [...SHEETS_LEFT_RAIL,...SHEETS_RIGHT_RAIL])
  assert.notEqual(resolveRailIcon(it.icon),RAIL_FALLBACK_ICON,`icon ${it.icon}`);
 for(const name of Object.keys(SHEETS_RAIL_ICONS))assert.ok(hasRailIcon(name),name);
});

test('inspector sections come from the panels task and default layout opens workbook + inspector',()=>{
 assert.deepEqual(sheetsInspectorDef.sections.map(s=>s.component),['sheets.inspector.cell','sheets.inspector.format','sheets.inspector.layout','sheets.inspector.slicer','sheets.inspector.timeline','sheets.inspector.formulas']);
 assert.deepEqual(resolveInspectorSections(sheetsInspectorDef.sections,ctx(false)).map(s=>s.id),[]);
 assert.deepEqual(resolveInspectorSections(sheetsInspectorDef.sections,ctx(false,{workbook:true})).map(s=>s.id),['format','layout','slicer','timeline','formulas']);
 assert.deepEqual(resolveInspectorSections(sheetsInspectorDef.sections,{...ctx(false,{workbook:true}),selection:{kind:'one' as const,count:1}}).map(s=>s.id),['cell','format','layout','slicer','timeline','formulas']);
 assert.deepEqual(stackPanels(panels,'left',SHEETS_LAYOUT.leftPanels,ctx(false)).map(p=>p.id),['workbook']);
 assert.deepEqual(stackPanels(panels,'right',SHEETS_LAYOUT.rightPanels,ctx(false)).map(p=>p.id),['inspector']);
});

test('customization defaults: versions starts in overflow, everything else pinned and ordered',()=>{
 const e=effectiveRail(SHEETS_LEFT_RAIL,undefined,{ctx:ctx(false)});
 assert.deepEqual(e.visible.map(i=>i.id),['workbook','files','search','analysis']);
 assert.deepEqual(e.overflow.map(i=>i.id),['versions']);
 const r=effectiveRail(SHEETS_RIGHT_RAIL,undefined,{ctx:ctx(false)});
 assert.deepEqual(r.visible.map(i=>i.id),['inspector','formulas','export']);
});

test('user overrides apply per side and sanitize against the sheets base set',()=>{
 const c=ctx(false);
 const down=editRailOverrides(sheetsStudio,undefined,'moveDown',{side:'left',id:'workbook'},c)!;
 assert.deepEqual(railModel(sheetsStudio,'left',down,c).visible.map(i=>i.id),['files','workbook','search','analysis']);
 assert.deepEqual(railModel(sheetsStudio,'right',down,c).visible.map(i=>i.id),['inspector','formulas','export']);
 const pinned=editRailOverrides(sheetsStudio,down,'pin',{side:'left',id:'versions'},c)!;
 assert.deepEqual(railModel(sheetsStudio,'left',pinned,c).visible.map(i=>i.id).at(-1),'versions');
 const hidden=editRailOverrides(sheetsStudio,pinned,'hide',{side:'left',id:'analysis'},c)!;
 const m=railModel(sheetsStudio,'left',hidden,c);
 assert.deepEqual(m.hidden.map(i=>i.id),['analysis']);
 assert.equal(editRailOverrides(sheetsStudio,undefined,'hide',{side:'right',id:'analysis'},c),null,'left id rejected on the right');
 const clean=sanitizeOverrides({order:['workbook','gone'],pinned:['old'],hidden:['nope']},SHEETS_LEFT_RAIL);
 assert.deepEqual(clean,{order:['workbook'],pinned:[],hidden:[],unpinned:[]});
 void railEdits;void EMPTY_RAIL_OVERRIDES;
});

test('the export quick action runs the real sheets.saveCopy command and nothing else',()=>{
 const off=registerSheetsCommands();
 try{
  const known=new Set(listCommands().map(c=>c.id));
  const commands=[...SHEETS_LEFT_RAIL,...SHEETS_RIGHT_RAIL].filter(i=>i.kind==='command'||i.kind==='action');
  assert.deepEqual(commands.map(c=>c.command),['sheets.saveCopy']);
  assert.ok(known.has('sheets.saveCopy'));
 }finally{off();}
 // The engine writes values and formulas only: no rail entry may promise formatting.
 for(const it of [...SHEETS_LEFT_RAIL,...SHEETS_RIGHT_RAIL])assert.ok(!/format/i.test(it.id+(it.command??'')),it.id);
});

test('every sheets.rail.* labelKey exists in all five catalogues',()=>{
 const keys=[...SHEETS_LEFT_RAIL,...SHEETS_RIGHT_RAIL].map(i=>i.labelKey).filter((k):k is string=>!!k);
 assert.ok(keys.length>=4);
 for(const key of keys)for(const [locale,catalogue] of Object.entries(CATALOGUES))assert.ok(catalogue[key],`${locale}:${key}`);
 // 'sheets.exportCopy' predates the rail and stays the export label.
 assert.ok(SHEETS_RIGHT_RAIL.find(i=>i.id==='export')!.labelKey==='sheets.exportCopy');
});
