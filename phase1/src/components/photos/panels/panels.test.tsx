import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {photosStudio} from '../../../lib/studios/photos';
import {validateStudioShell} from '../../../lib/shell/panels';
import {hasRailIcon} from '../../../lib/shell/railIcons';
import {listCommands} from '../../../lib/commands';
import {CATALOGUES} from '../../../lib/i18n';
import {BUILT_IN_PRESETS} from '../../../lib/photos/presets';
import {PHOTOS_PANEL_COMMANDS,PHOTOS_PANELS} from '../../../lib/photos/panelManifest';
import {photosCommandSpecs} from '../../../lib/photos/panelCommands';
import {PHOTOS_PANEL_HOSTS} from './hostMap';
import {HistogramView} from './HistogramPanel';
import {changeSummary} from './HistoryPanel';
import {neutralPhotoSettings as n} from '../../../lib/photos/studioSettings';
import {describeChange} from '../../../lib/photos/historyLog';
test('the Photos manifest validates: hosts, icons, commands, rail targets, layout',()=>{
 const ids=new Set(photosCommandSpecs().map(s=>s.id));
 const problems=validateStudioShell('photos',photosStudio.shellV2!,{commandExists:id=>ids.has(id)||listCommands().some(c=>c.id===id),hostExists:c=>c in PHOTOS_PANEL_HOSTS,iconExists:hasRailIcon});
 assert.deepEqual(problems,[]);
});
test('every panel has a host, a titleKey in all locales and only declared commands',()=>{
 const ids=new Set(photosCommandSpecs().map(s=>s.id));
 assert.deepEqual(Object.keys(PHOTOS_PANEL_HOSTS).sort(),PHOTOS_PANELS.map(p=>p.component).sort());
 for(const p of PHOTOS_PANELS){
  assert.ok(p.titleKey);for(const l of Object.keys(CATALOGUES))assert.ok(CATALOGUES[l][p.titleKey!],`${p.id} title in ${l}`);
  for(const c of p.commands??[])assert.ok(ids.has(c),`${p.id} -> ${c}`);
 }
 for(const c of PHOTOS_PANEL_COMMANDS)assert.ok(ids.has(c));
});
test('every built-in preset has a label in all locales',()=>{
 for(const p of BUILT_IN_PRESETS)for(const l of Object.keys(CATALOGUES))assert.ok(CATALOGUES[l][p.labelKey]&&CATALOGUES[l][p.labelKey]!==p.labelKey,`${l}:${p.labelKey}`);
});
test('rail items of the right side are ordered and every panel has exactly one rail item',()=>{
 const rails=[...photosStudio.shellV2!.leftRail!,...photosStudio.shellV2!.rightRail!];
 for(const p of PHOTOS_PANELS)assert.equal(rails.filter(r=>r.panel===p.id).length,1,p.id);
 const right=photosStudio.shellV2!.rightRail!.map(r=>r.order);assert.deepEqual(right,[...right].sort((a,b)=>a-b));
 assert.deepEqual(photosStudio.shellV2!.rightRail!.map(r=>r.id),['histogram','curves','light','color','effects','detail','transform','presets','export']);
});
test('locale files of the panels have the same keys and placeholders in all five languages',()=>{
 const ref=Object.keys(CATALOGUES.en).filter(k=>k.startsWith('photos.p.')||k.startsWith('photos.preset.')||k.startsWith('photos.panel.')||k.startsWith('cmd.photos.'));
 assert.ok(ref.length>80);
 const ph=(s:string)=>(s.match(/\{[a-zA-Z]+\}/g)??[]).sort().join(',');
 for(const l of Object.keys(CATALOGUES))for(const k of ref){assert.ok(CATALOGUES[l][k],`${l}:${k}`);assert.equal(ph(CATALOGUES[l][k]),ph(CATALOGUES.en[k]),`${l}:${k} placeholders`);}
 for(const l of ['de','es','fr','pt-BR'])assert.notEqual(CATALOGUES[l]['photos.p.empty'],CATALOGUES.en['photos.p.empty'],`${l} is translated`);
});
test('without a photo every panel shows the empty state and no controls',()=>{
 for(const [id,Host] of Object.entries(PHOTOS_PANEL_HOSTS)){
  const html=renderToStaticMarkup(<Host panelId={id.split('.')[1]} context={{studio:'photos',selection:{kind:'none',count:0},busy:false,services:{}}}/>);
  assert.match(html,/-empty"/,id);assert.doesNotMatch(html,/<input|<button/,id);assert.doesNotMatch(html,/coming soon/i,id);
 }
});
test('histogram view renders stats from real pixels and warns on clipping',()=>{
 const bytes=new Uint8Array([0,0,0,255,255,255,255,255,128,128,128,255,0,0,0,255]);
 const html=renderToStaticMarkup(<HistogramView frame={{bytes:bytes.buffer as ArrayBuffer,width:2,height:2}} channel="luma"/>);
 assert.match(html,/photos-hist-shadows">50\.0%/);assert.match(html,/photos-hist-highlights">25\.0%/);assert.match(html,/photos-hist-warning/);assert.match(html,/<path d="M0 64/);
 const rgb=renderToStaticMarkup(<HistogramView frame={{bytes:bytes.buffer as ArrayBuffer,width:2,height:2}} channel="rgb"/>);assert.equal((rgb.match(/<path/g)??[]).length,3);
 const flat=renderToStaticMarkup(<HistogramView frame={{bytes:new Uint8Array([100,100,100,255]).buffer as ArrayBuffer,width:1,height:1}} channel="luma"/>);assert.doesNotMatch(flat,/photos-hist-warning/);
});
test('history summaries are readable and bounded',()=>{
 const t=(k:string)=>k;const s=(p:object)=>describeChange(n,{...n,...p});
 assert.equal(changeSummary([],t),'photos.p.history.noChange');
 assert.match(changeSummary(s({exposure:1.5}),t),/photos\.exposure 0 → 1\.5/);
 assert.equal(changeSummary(s({crop:{x0:0,y0:0,x1:0.5,y1:0.5}}),t),'photos.p.history.cropSet');
 assert.match(changeSummary(s({exposure:1,contrast:2,shadows:3,whites:4}),t),/ \+1$/);
});
