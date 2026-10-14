import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {slidesStudio} from '../studios/slides';
import {SLIDES_DEFAULT_LAYOUT,SLIDES_GLOBAL_PANEL_IDS,SLIDES_LEFT_RAIL,SLIDES_PANEL_IDS,SLIDES_RAIL_LABEL_KEYS,SLIDES_RIGHT_RAIL,registerSlidesRailIcons} from './shellRail';
import {slidesCommandSpecs} from './commands';
import {slidesPanelCommandSpecs} from './panelCommands';
import {validateStudioShell,stackPanels} from '../shell/panels';
import {effectiveRail} from '../shell/railResolver';
import {editRailOverrides,railModel} from '../../store/railActions';
import {hasRailIcon,registerRailIcons,resolveRailIcon,RAIL_FALLBACK_ICON} from '../shell/railIcons';
import '../../components/shell/railIconSet';
import {CATALOGUES,translate} from '../i18n';
const deps={state:()=>({busy:false,working:true,canUndo:true,canRedo:true,slides:3,index:0,presenting:false}),present:()=>{},exitPresent:()=>{},history:()=>{},saveCopy:()=>{},showSlide:()=>{}};
const panelDeps={state:()=>({source:'',index:0,busy:false,working:null,runs:[],slideIds:[],layouts:[],model:null,summary:null}),thumbnails:async()=>{},edit:async()=>{},show:async()=>{},select:()=>{},move:async()=>{},duplicate:async()=>{},remove:async()=>{},add:async()=>{},setBounds:async()=>{},pick:()=>{},picked:()=>null};
const known=new Set([...slidesCommandSpecs(deps),...slidesPanelCommandSpecs(panelDeps)].map(s=>s.id));
const shell=slidesStudio.shellV2!;
const ids=(l:readonly {id:string}[])=>l.map(i=>i.id);
const ctx={studio:'slides',selection:{kind:'none',count:0},services:{}};

test('slides manifest passes the shell validator with the rail, panels, inspector, commands and icons',()=>{
 const hosts=new Set(shell.panels!.map(p=>p.component));
 const sectionHosts=new Set((shell.inspector?.sections??[]).map(s=>s.component));
 assert.deepEqual(validateStudioShell('slides',shell,{commandExists:id=>known.has(id),hostExists:c=>hosts.has(c),sectionHostExists:c=>sectionHosts.has(c),iconExists:hasRailIcon}),[]);
 assert.equal(shell.leftRail,SLIDES_LEFT_RAIL);assert.equal(shell.rightRail,SLIDES_RIGHT_RAIL);assert.equal(shell.defaultLayout,SLIDES_DEFAULT_LAYOUT);
});
test('every panel item targets a rail panel on its own side; every contract panel has a rail item; commands exist',()=>{
 for(const [rail,side] of [[SLIDES_LEFT_RAIL,'left'],[SLIDES_RIGHT_RAIL,'right']] as const){
  for(const it of rail){
   if(it.kind==='panel'){const p=shell.panels!.find(x=>x.id===it.panel);assert.ok(p,it.id);assert.equal(p!.side,side);assert.notEqual(p!.placement,'docked');}
   else{assert.equal(it.kind,'command');assert.ok(known.has(it.command!),it.command);}
  }
  const orders=rail.map(i=>i.order);assert.deepEqual(orders,[...orders].sort((a,b)=>a-b));assert.equal(new Set(orders).size,orders.length);assert.equal(new Set(ids(rail)).size,rail.length);
 }
 const leftPanelItems=SLIDES_LEFT_RAIL.filter(i=>i.kind==='panel').map(i=>i.panel);
 for(const id of [...SLIDES_PANEL_IDS.left,...SLIDES_GLOBAL_PANEL_IDS])assert.ok(leftPanelItems.includes(id),id);
 assert.deepEqual(SLIDES_RIGHT_RAIL.map(i=>i.panel),[...SLIDES_PANEL_IDS.right]);
});
test('defaults: panels and Save a copy pinned, Undo/Redo in overflow; one right item',()=>{
 const l=effectiveRail(SLIDES_LEFT_RAIL,undefined,{ctx});
 assert.deepEqual(ids(l.visible),['files','overview','outline','search','versions','saveCopy']);assert.deepEqual(ids(l.overflow),['undo','redo']);
 const r=effectiveRail(SLIDES_RIGHT_RAIL,undefined,{ctx});assert.deepEqual(ids(r.visible),['inspector']);assert.deepEqual(r.overflow,[]);
});
test('default layout opens the overview left and the inspector right',()=>{
 assert.deepEqual(stackPanels(shell.panels!,'left',SLIDES_DEFAULT_LAYOUT.leftPanels,ctx).map(p=>p.id),['overview']);
 assert.deepEqual(stackPanels(shell.panels!,'right',SLIDES_DEFAULT_LAYOUT.rightPanels,ctx).map(p=>p.id),['inspector']);
});
test('customization: move, pin an overflow command, hide, reset; left edits leave the right rail alone',()=>{
 const m=(o:ReturnType<typeof editRailOverrides>,side:'left'|'right')=>railModel(slidesStudio,side,o??undefined,ctx);
 let o=editRailOverrides(slidesStudio,undefined,'pin',{side:'left',id:'undo'},ctx)!;
 assert.deepEqual(ids(m(o,'left').visible).slice(-2),['saveCopy','undo']);assert.deepEqual(ids(m(o,'left').overflow),['redo']);
 o=editRailOverrides(slidesStudio,o,'move',{side:'left',id:'undo',to:0},ctx)!;assert.equal(m(o,'left').visible[0].id,'undo');
 o=editRailOverrides(slidesStudio,o,'hide',{side:'left',id:'outline'},ctx)!;
 assert.ok(!ids(m(o,'left').visible).includes('outline'));assert.deepEqual(ids(m(o,'left').hidden),['outline']);
 assert.deepEqual(ids(m(o,'right').visible),['inspector']);
 o=editRailOverrides(slidesStudio,o,'unpin',{side:'left',id:'saveCopy'},ctx)!;assert.deepEqual(ids(m(o,'left').overflow),['saveCopy','redo']);
 assert.equal(editRailOverrides(slidesStudio,undefined,'hide',{side:'right',id:'overview'},ctx),null);
 const reset=editRailOverrides(slidesStudio,o,'reset',{side:'left',id:''},ctx)!;
 assert.deepEqual(ids(m(reset,'left').visible),['files','overview','outline','search','versions','saveCopy']);
});
test('icons: every rail icon is registered, resolves to a real svg glyph, and shared functions match Documents',()=>{
 registerSlidesRailIcons();registerSlidesRailIcons();
 for(const it of [...SLIDES_LEFT_RAIL,...SLIDES_RIGHT_RAIL]){
  assert.ok(hasRailIcon(it.icon),it.icon);assert.notEqual(resolveRailIcon(it.icon),RAIL_FALLBACK_ICON,it.icon);
  const html=renderToStaticMarkup(createElement(resolveRailIcon(it.icon),{}));assert.match(html,/<svg[^>]*data-icon="[a-z0-9:-]+"/);
 }
 const used=[...SLIDES_LEFT_RAIL,...SLIDES_RIGHT_RAIL].map(i=>resolveRailIcon(i.icon));assert.equal(new Set(used).size,used.length,'one glyph per function');
 const byId=(id:string)=>SLIDES_LEFT_RAIL.find(i=>i.id===id)!.icon;
 assert.deepEqual([byId('files'),byId('overview'),byId('outline'),byId('search'),byId('versions')],['Files','Copy','Hash','Search','VersionsIcon']);
 const before=resolveRailIcon('Undo2');registerRailIcons({Undo2:RAIL_FALLBACK_ICON});assert.equal(resolveRailIcon('Undo2'),before,'first wins');
});
test('labels: keyed items have catalogue entries in all five locales; shared items keep their English label',()=>{
 for(const locale of ['en','de','es','fr','pt-BR'])for(const key of Object.values(SLIDES_RAIL_LABEL_KEYS)){assert.ok(CATALOGUES[locale]?.[key]?.trim(),`${locale}: ${key}`);}
 for(const it of [...SLIDES_LEFT_RAIL,...SLIDES_RIGHT_RAIL]){
  const key=SLIDES_RAIL_LABEL_KEYS[it.id];assert.equal(it.labelKey,key);
  if(!key)assert.ok(['files','search','versions'].includes(it.id),it.id);
 }
 assert.equal(translate('de','slides.rail.overview'),'Folien');assert.equal(translate('en','slides.rail.saveCopy'),'Save a copy');
 assert.notEqual(translate('fr','slides.rail.undo'),translate('en','slides.rail.undo'));
});


test('Slides hero uses the shared header contract and only registered presentation commands',()=>{
 const hero=slidesStudio.shell.header.heroAction!;assert.equal(hero.id,'slides.present');assert.equal(hero.icon,'Presentation');
 for(const id of [hero.id,...hero.menu!.filter(id=>id!=='deploy.open')])assert.ok(known.has(id),id);
 for(const locale of ['en','de','es','fr','pt-BR'])assert.ok(CATALOGUES[locale][hero.labelKey],locale);
 assert.equal(hero.menu!.at(-1),'deploy.open');assert.ok(!hero.menu!.includes('slides.exportPdf'));
});
