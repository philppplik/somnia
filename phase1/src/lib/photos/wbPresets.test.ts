import test from 'node:test';
import assert from 'node:assert/strict';
import {findWbPreset,isWbPresetActive,WB_PRESETS} from './wbPresets';
test('every preset pair stays inside the engine ranges',()=>{
 for(const p of WB_PRESETS){assert.ok(p.temp>=2000&&p.temp<=50000);assert.ok(p.tint>=-150&&p.tint<=150);}
});
test('find + active detection',()=>{
 const d=findWbPreset('daylight')!;
 assert.ok(isWbPresetActive({temp:5500,tint:10},d));
 assert.ok(!isWbPresetActive({temp:6500,tint:0},d));
 assert.equal(findWbPreset('nope'),undefined);
});
