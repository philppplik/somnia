import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILT_IN_PRESETS,LOOK_KEYS,MAX_USER_PRESETS,addUserPreset,applyLook,cleanPresetName,extractLook,isNeutralLook,parseUserPresets,removeUserPreset} from './presets';
import {neutralPhotoSettings,sanitizePhotoSettings,PHOTO_CONTROLS,type PhotoSettings} from './studioSettings';
const geometry:Partial<PhotoSettings>={orientation:1,flipH:true,flipV:true,straighten:3.5,crop:{x0:0.1,y0:0.1,x1:0.8,y1:0.9}};
test('every built-in look is valid for the engine ranges as written (no clamping needed)',()=>{
 for(const p of BUILT_IN_PRESETS){
  for(const [k,v] of Object.entries(p.look)){const c=PHOTO_CONTROLS.find(x=>x.key===k)!;assert.ok(c,`${p.id}.${k}`);assert.ok(v!>=c.min&&v!<=c.max,`${p.id}.${k}=${v}`);assert.ok(LOOK_KEYS.includes(k as never));}
  const applied=applyLook(neutralPhotoSettings,p.look);assert.deepEqual(sanitizePhotoSettings(applied),applied);
 }
 assert.deepEqual(new Set(BUILT_IN_PRESETS.map(p=>p.id)).size,BUILT_IN_PRESETS.length);
});
test('a look never touches geometry',()=>{
 const cur={...neutralPhotoSettings,...geometry,exposure:2,contrast:50} as PhotoSettings;
 const out=applyLook(cur,BUILT_IN_PRESETS.find(p=>p.id==='vivid')!.look);
 for(const k of ['orientation','flipH','flipV','straighten','crop'] as const)assert.deepEqual(out[k],cur[k]);
 assert.equal(out.exposure,0,'earlier look values are replaced, not stacked');assert.equal(out.contrast,18);
});
test('neutral look resets all look keys and keeps geometry',()=>{
 const cur={...neutralPhotoSettings,...geometry,saturation:-100,temp:3000} as PhotoSettings;
 const out=applyLook(cur,{});assert.ok(isNeutralLook(out));assert.equal(out.orientation,1);
});
test('extractLook keeps only changed keys and round-trips through applyLook',()=>{
 const s={...neutralPhotoSettings,exposure:1.25,temp:5200,sharpen:40} as PhotoSettings;
 assert.deepEqual(extractLook(s),{exposure:1.25,temp:5200,sharpen:40});
 assert.deepEqual(applyLook(neutralPhotoSettings,extractLook(s)),s);
});
test('applyLook clamps out-of-range values and ignores unknown or non-numeric keys',()=>{
 const out=applyLook(neutralPhotoSettings,{exposure:99,contrast:NaN,bogus:5} as never);
 assert.equal(out.exposure,5);assert.equal(out.contrast,0);assert.ok(!('bogus' in out));
});
test('parseUserPresets drops malformed, duplicate and hostile entries',()=>{
 const raw=[{id:'a',name:'  Warm   day ',look:{exposure:0.5}},{id:'a',name:'dup',look:{}},{id:'',name:'x',look:{}},{id:'b',name:'',look:{}},{id:'c',name:'c',look:null},'str',null,
  {id:'d',name:'Wild',look:{exposure:1000,evil:'x',crop:{x0:0}}},{id:'__proto__',name:'p',look:{}}];
 const out=parseUserPresets(raw);
 assert.deepEqual(out.map(p=>p.id),['a','d','__proto__']);assert.equal(out[0].name,'Warm day');assert.equal(out[1].look.exposure,5);assert.ok(!('evil' in out[1].look));
 assert.deepEqual(parseUserPresets('nope'),[]);assert.deepEqual(parseUserPresets(undefined),[]);
});
test('add replaces by name (case-insensitive), caps the list, remove works',()=>{
 let n=0;const id=()=>`p${n++}`;const s={...neutralPhotoSettings,exposure:1} as PhotoSettings;
 let list=addUserPreset([],'Sunny',s,id);assert.equal(list.length,1);
 list=addUserPreset(list,'  sunny ',{...s,exposure:2} as PhotoSettings,id);assert.equal(list.length,1);assert.equal(list[0].look.exposure,2);assert.equal(list[0].id,'p0');
 assert.equal(addUserPreset(list,'   ',s,id).length,1,'blank names are ignored');
 for(let i=0;i<MAX_USER_PRESETS+5;i++)list=addUserPreset(list,`n${i}`,s,id);assert.equal(list.length,MAX_USER_PRESETS);
 assert.equal(removeUserPreset(list,'p0').length,MAX_USER_PRESETS-1);
 assert.equal(cleanPresetName('x'.repeat(100)).length,40);
});
