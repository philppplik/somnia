import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const FILES=['Settings.tsx','GlassSettings.tsx','ModifiedSettings.tsx','FrameworkSettings.tsx','LanHostSettings.tsx','SettingsSearchResults.tsx'];
test('settings area renders every control through native control primitives',()=>{
 for(const f of FILES){
  const src=readFileSync(join(new URL('.',import.meta.url).pathname,f),'utf8');
  assert.doesNotMatch(src,/<(button|input|select|textarea)\b/,`${f} still has a raw form control`);
  assert.match(src,/from '\.\/ui\/native-controls'/,`${f} must import native control primitives`);
 }
});
test('settings capture harness still names every expected section',()=>{
 const src=readFileSync(join(new URL('.',import.meta.url).pathname,'../../test/settings-migration/sections.ts'),'utf8');
 for(const name of ['Modified','General','Appearance','Canvas','Editing','Typography','Code editor','Projects','Export & Publish','Collaboration','Preview','Shortcuts','AI','Extensions','Frameworks','Updates','Advanced','About'])assert.ok(src.includes(`'${name}'`),name);
});
