import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {documentsStudio,documentsShell,documentsPanels,documentsLeftRail,documentsRightRail,documentsInspector,DOCUMENTS_LAYOUT,DOCUMENTS_COMMANDS} from '../studios/documents';
import {validateStudioShell,resolveInspectorSections,stackPanels} from '../shell/panels';
import {effectiveRail,railEdits,EMPTY_RAIL_OVERRIDES} from '../shell/railResolver';
import {hasRailIcon,resolveRailIcon,RAIL_FALLBACK_ICON} from '../shell/railIcons';
import {INSPECTOR_HOST} from '../shell/types';
import {hasPanelHost,registerPanelHost} from '../../components/studios/hosts';
import {hasInspectorSection} from '../../components/shell/InspectorPanel';
import '../../components/shell/railIconSet';
import {CATALOGUES} from '../i18n';
import {DOCUMENTS_PANEL_COMMANDS,DOCUMENTS_PANELS} from './panels';

// Wave A hosts are still in flight: stand in for the agreed id first, then run the host registrations
// (registerStudioPanels throws when the manifest names a host nobody supplies — that guard is intentional).
if(!hasPanelHost('documents.find'))registerPanelHost('documents.find',()=>null);
await import('../../components/documents/registerShell');
const knownCommands=new Set(DOCUMENTS_COMMANDS);
const ids=(l:readonly {id:string}[])=>l.map(i=>i.id);
const ctx=(sel:'none'|'one',services:Record<string,boolean>={})=>({studio:'documents',selection:{kind:sel,count:sel==='none'?0:1},services,data:{block:2}});

test('manifest passes the shell validator against the real host and icon registries',()=>{
 assert.deepEqual(validateStudioShell('documents',documentsShell,{
  commandExists:id=>knownCommands.has(id),hostExists:hasPanelHost,sectionHostExists:hasInspectorSection,iconExists:hasRailIcon,
 }),[]);
});

test('left rail: studio-agnostic panels first, then pages/outline/find, then versions; right rail is the inspector',()=>{
 assert.deepEqual(ids(documentsLeftRail),['files','pages','outline','find','search','versions']);
 assert.deepEqual(ids(documentsRightRail),['inspector']);
 for(const item of [...documentsLeftRail,...documentsRightRail]){
  assert.equal(item.kind,'panel',item.id);
  const panel=documentsPanels.find(p=>p.id===item.panel);
  assert.ok(panel,item.id);
  assert.equal(panel!.side,item===documentsRightRail[0]?'right':'left',item.id);
  assert.notEqual((panel as {placement?:string}).placement,'docked',item.id);
 }
 // orders strictly increase (stable default positions for the resolver)
 const orders=documentsLeftRail.map(i=>i.order);
 assert.deepEqual(orders,[...orders].sort((a,b)=>a-b));
 assert.equal(new Set(orders).size,orders.length);
});

test('panel composition: wave A panels (outline, find) plus studio-agnostic panels and the shell inspector',()=>{
 assert.deepEqual(ids(DOCUMENTS_PANELS),['outline','find']);
 for(const p of DOCUMENTS_PANELS){
  assert.equal(p.side,'left');assert.ok(p.component.startsWith('documents.'),p.id);
  assert.ok(documentsPanels.includes(p),p.id);
 }
 assert.ok(documentsPanels.some(p=>p.component===INSPECTOR_HOST&&p.side==='right'),'shell inspector panel');
 // studio-agnostic panels reuse the shared Code hosts
 for(const [id,host] of [['files','code.files'],['search','code.search'],['versions','code.versions']] as const){
  const p=documentsPanels.find(x=>x.id===id);assert.equal(p?.component,host,id);
 }
});

test('inspector section list: document always, selection on a caret paragraph, text/risks by service',()=>{
 assert.deepEqual(ids(documentsInspector.sections),['document','selection','text','risks']);
 // wave A owns document/selection, foundation owns text/risks — ids are the contract between the two
 assert.equal(documentsInspector.sections[0].component,'documents.inspector.document');
 assert.equal(documentsInspector.sections[1].component,'documents.inspector.selection');
 const at=(c:unknown)=>ids(resolveInspectorSections(documentsInspector.sections,c));
 assert.deepEqual(at(ctx('none')),['document']);
 assert.deepEqual(at(ctx('one',{ready:true})),['document','selection','text']);
 assert.deepEqual(at(ctx('one',{ready:true,risks:true})),['document','selection','text','risks']);
 assert.deepEqual(at(ctx('none',{risks:true})),['document','risks']);
});

test('icons: every rail and panel icon name resolves to a registered Vadivam glyph',()=>{
 for(const item of [...documentsLeftRail,...documentsRightRail]){
  assert.ok(hasRailIcon(item.icon),item.icon);
  assert.notEqual(resolveRailIcon(item.icon),RAIL_FALLBACK_ICON,item.icon);
  const html=renderToStaticMarkup(createElement(resolveRailIcon(item.icon),{}));
  assert.match(html,/data-icon="(vadivam:[a-z-]+|versions)"/,item.icon);
 }
 for(const p of documentsPanels)if(p.icon)assert.ok(hasRailIcon(p.icon),p.id);
 // distinct functions, distinct glyphs: find-in-document is not the global project search
 assert.notEqual(resolveRailIcon('FileSearchCorner'),resolveRailIcon('Search'));
 assert.notEqual(resolveRailIcon('List'),resolveRailIcon('Layers'));
});

test('customization defaults: everything pinned, nothing hidden, resolver behaviour intact',()=>{
 const c=ctx('none');
 const e=effectiveRail(documentsLeftRail,undefined,{ctx:c});
 assert.deepEqual(ids(e.visible),ids(documentsLeftRail));
 assert.deepEqual(e.overflow,[]);
 for(const item of documentsLeftRail){assert.equal(item.defaultPinned,undefined,item.id);assert.equal(item.when,undefined,item.id);}
 // reorder + hide + unpin compose; reset restores the defaults
 let o=railEdits.reorder(EMPTY_RAIL_OVERRIDES,ids(documentsLeftRail),'find',0);
 o=railEdits.hide(o,'pages');o=railEdits.unpin(o,'versions');
 const m=effectiveRail(documentsLeftRail,o,{ctx:c});
 assert.deepEqual(ids(m.visible),['find','files','outline','search']);
 assert.deepEqual(ids(m.overflow),['versions']);
 assert.deepEqual(ids(effectiveRail(documentsLeftRail,railEdits.reset(),{ctx:c}).visible),ids(documentsLeftRail));
});

test('default layout: Files left, inspector right, only existing panels listed, widths in store clamps',()=>{
 assert.deepEqual(DOCUMENTS_LAYOUT.leftPanels,['files']);
 assert.deepEqual(DOCUMENTS_LAYOUT.rightPanels,['inspector']);
 assert.equal(DOCUMENTS_LAYOUT.activeLeft,'files');
 assert.equal(DOCUMENTS_LAYOUT.activeRight,'inspector');
 for(const id of DOCUMENTS_LAYOUT.leftPanels)assert.ok(documentsPanels.some(p=>p.id===id&&p.side==='left'),id);
 for(const id of DOCUMENTS_LAYOUT.rightPanels)assert.ok(documentsPanels.some(p=>p.id===id&&p.side==='right'),id);
 assert.ok(DOCUMENTS_LAYOUT.leftWidth>=220&&DOCUMENTS_LAYOUT.leftWidth<=380);
 assert.ok(DOCUMENTS_LAYOUT.rightWidth>=280&&DOCUMENTS_LAYOUT.rightWidth<=400);
 // first open: the stack shows Files left and the inspector right
 assert.deepEqual(ids(stackPanels(documentsPanels,'left',DOCUMENTS_LAYOUT.leftPanels,ctx('none'))),['files']);
 assert.deepEqual(ids(stackPanels(documentsPanels,'right',DOCUMENTS_LAYOUT.rightPanels,ctx('none'))),['inspector']);
});

test('labels: rail labelKeys and panel titleKeys exist in all five locales',()=>{
 for(const item of [...documentsLeftRail,...documentsRightRail])if(item.labelKey)
  for(const [locale,cat] of Object.entries(CATALOGUES))assert.ok(item.labelKey in cat,`${locale}: ${item.labelKey}`);
 for(const p of documentsPanels)if(p.titleKey)
  for(const [locale,cat] of Object.entries(CATALOGUES))assert.ok(p.titleKey in cat,`${locale}: ${p.titleKey}`);
 for(const s of documentsInspector.sections)if(s.titleKey)
  for(const [locale,cat] of Object.entries(CATALOGUES))assert.ok(s.titleKey in cat,`${locale}: ${s.titleKey}`);
 for(const key of [documentsInspector.titleKey,documentsInspector.emptyKey])if(key)
  for(const [locale,cat] of Object.entries(CATALOGUES))assert.ok(key in cat,`${locale}: ${key}`);
});

test('command list: foundation commands plus wave A panel commands, namespaced and unique',()=>{
 for(const id of['documents.zoomIn','documents.zoomOut','documents.zoomReset','documents.undo','documents.redo','documents.pages.goto','documents.outline.goto'])
  assert.ok(DOCUMENTS_COMMANDS.includes(id),id);
 for(const id of DOCUMENTS_PANEL_COMMANDS)assert.ok(DOCUMENTS_COMMANDS.includes(id),id);
 assert.equal(new Set(DOCUMENTS_COMMANDS).size,DOCUMENTS_COMMANDS.length);
 for(const id of DOCUMENTS_COMMANDS)assert.ok(id.startsWith('documents.'),id);
 // the studio keeps its three pre-shell command declarations
 assert.deepEqual(documentsStudio.commands.map(c=>c.id),['documents.saveCopy','documents.zoomIn','documents.zoomOut']);
});
