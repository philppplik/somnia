import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {PHOTOS_DEFAULT_LAYOUT,PHOTOS_LEFT_RAIL,PHOTOS_PANEL_IDS,PHOTOS_RAIL_LABEL_KEYS,PHOTOS_RIGHT_RAIL,registerPhotosRailIcons} from './shellRail';
import {PHOTOS_RAIL_ICON_MAP} from './railIcons';
import {hasRailIcon,resolveRailIcon,RAIL_FALLBACK_ICON} from '../shell/railIcons';
import {effectiveRail,railEdits,EMPTY_RAIL_OVERRIDES} from '../shell/railResolver';
import {validateStudioShell} from '../shell/panels';
import type {PanelDef} from '../shell/types';
import {CATALOGUES,translate} from '../i18n';
import {getStudio} from '../studios';
const panel=(id:string,side:'left'|'right'):PanelDef=>({id,title:id,component:`photos.${id}`,side});
const PANELS=[...PHOTOS_PANEL_IDS.left.map(i=>panel(i,'left')),...PHOTOS_PANEL_IDS.right.map(i=>panel(i,'right'))];
const ids=(l:readonly {id:string}[])=>l.map(i=>i.id);
test('rails validate against a panel set built from the contract ids',()=>{
 const problems=validateStudioShell('photos',{panels:PANELS,leftRail:PHOTOS_LEFT_RAIL,rightRail:PHOTOS_RIGHT_RAIL,defaultLayout:PHOTOS_DEFAULT_LAYOUT},{hostExists:()=>true,iconExists:hasRailIcon});
 assert.deepEqual(problems,[]);
});
test('every rail item targets exactly one contract panel on its own side, no duplicates, orders strictly increase',()=>{
 for(const [rail,side] of [[PHOTOS_LEFT_RAIL,'left'],[PHOTOS_RIGHT_RAIL,'right']] as const){
  assert.deepEqual(ids(rail),[...PHOTOS_PANEL_IDS[side]]);
  rail.forEach(i=>{assert.equal(i.kind,'panel');assert.equal(i.panel,i.id);});
  const orders=rail.map(i=>i.order);assert.deepEqual(orders,[...orders].sort((a,b)=>a-b));assert.equal(new Set(orders).size,orders.length);
 }
});
test('icons: every rail icon is registered, resolves to a real glyph and renders a Vadivam svg',()=>{
 registerPhotosRailIcons();registerPhotosRailIcons();
 for(const it of [...PHOTOS_LEFT_RAIL,...PHOTOS_RIGHT_RAIL]){
  assert.ok(hasRailIcon(it.icon),it.icon);assert.notEqual(resolveRailIcon(it.icon),RAIL_FALLBACK_ICON,it.icon);
  const html=renderToStaticMarkup(createElement(resolveRailIcon(it.icon),{}));
  assert.match(html,/<svg[^>]*data-icon="vadivam:[a-z-]+"/);assert.match(html,/aria-hidden="true"/);
 }
 assert.equal(new Set(Object.values(PHOTOS_RAIL_ICON_MAP)).size,Object.keys(PHOTOS_RAIL_ICON_MAP).length,'one glyph per function');
});
test('customization defaults: Info starts in overflow, rest visible in manifest order',()=>{
 const l=effectiveRail(PHOTOS_LEFT_RAIL,undefined,{ctx:{}});
 assert.deepEqual(ids(l.visible),['history']);assert.deepEqual(ids(l.overflow),['info']);
 const r=effectiveRail(PHOTOS_RIGHT_RAIL,undefined,{ctx:{}});
 assert.deepEqual(ids(r.visible),['light','color','effects','detail','transform']);assert.deepEqual(r.overflow,[]);
});
test('customization: reorder, hide, pin and reset work on the photos rail',()=>{
 let o=railEdits.reorder(EMPTY_RAIL_OVERRIDES,['light','color','effects','detail','transform'],'transform',0);
 o=railEdits.hide(o,'effects');o=railEdits.unpin(o,'detail');
 const e=effectiveRail(PHOTOS_RIGHT_RAIL,o,{ctx:{}});
 assert.deepEqual(ids(e.visible),['transform','light','color']);assert.deepEqual(ids(e.overflow),['detail']);
 const l=effectiveRail(PHOTOS_LEFT_RAIL,railEdits.pin(EMPTY_RAIL_OVERRIDES,'info'),{ctx:{}});
 assert.deepEqual(ids(l.visible),['history','info']);
 assert.deepEqual(ids(effectiveRail(PHOTOS_RIGHT_RAIL,railEdits.reset(),{ctx:{}}).visible),ids(PHOTOS_RIGHT_RAIL));
});
test('default layout only lists panels that exist on that side and opens the canvas first',()=>{
 for(const id of PHOTOS_DEFAULT_LAYOUT.rightPanels)assert.ok((PHOTOS_PANEL_IDS.right as readonly string[]).includes(id));
 for(const id of PHOTOS_DEFAULT_LAYOUT.leftPanels)assert.ok((PHOTOS_PANEL_IDS.left as readonly string[]).includes(id));
 assert.equal(PHOTOS_DEFAULT_LAYOUT.leftOpen,false);assert.equal(PHOTOS_DEFAULT_LAYOUT.activeRight,'light');
});
test('labels: every item carries a labelKey that exists in all five locales',()=>{
 for(const it of [...PHOTOS_LEFT_RAIL,...PHOTOS_RIGHT_RAIL]){
  assert.equal(it.labelKey,PHOTOS_RAIL_LABEL_KEYS[it.id as keyof typeof PHOTOS_RAIL_LABEL_KEYS]);
  for(const locale of ['en','de','es','fr','pt-BR'])assert.ok(CATALOGUES[locale]?.[it.labelKey!],`${locale}: ${it.labelKey}`);
 }
 assert.equal(translate('de','photos.rail.light'),'Licht');
 assert.deepEqual(Object.keys(PHOTOS_RAIL_LABEL_KEYS).sort(),[...PHOTOS_PANEL_IDS.left,...PHOTOS_PANEL_IDS.right].sort());
});
test('photos studio manifest is untouched by this module (rails are not wired yet)',()=>{
 assert.equal(getStudio('photos').id,'photos');
});
