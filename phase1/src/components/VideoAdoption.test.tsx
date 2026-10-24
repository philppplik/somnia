import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const FILES=['TitleInspector.tsx','VideoInspector.tsx','VideoPanels.tsx','VideoWorkspace.tsx'];
test('no raw form controls remain anywhere in the video area',()=>{
 const dir=new URL('./video/',import.meta.url).pathname;
 for(const f of FILES){
  const src=readFileSync(join(dir,f),'utf8');
  assert.doesNotMatch(src,/<(button|input|select|textarea)\b/,`${f} still has a raw form control`);
  assert.match(src,/from '\.\.\/ui\/native-controls'/,`${f} must import native control primitives`);
 }
});
