import test from 'node:test';import assert from 'node:assert/strict';
import {SHORTCUT_HINTS} from './shortcuts';
test('the shortcut list is non-empty, unique and locale-keyed',()=>{
 assert.ok(SHORTCUT_HINTS.length>=8);
 const keys=new Set(SHORTCUT_HINTS.map(h=>h.labelKey));
 assert.equal(keys.size,SHORTCUT_HINTS.length);
 for(const h of SHORTCUT_HINTS){assert.ok(h.keys.length>0);assert.match(h.labelKey,/^studio3d\.keys\.[a-zA-Z]+$/);}
});
