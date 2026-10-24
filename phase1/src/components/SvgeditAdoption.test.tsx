import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const FILES=['GradientEditor.tsx','SnapPanel.tsx','SvgEditor.tsx','SvgInspector.tsx','SvgOptionsBar.tsx','SvgSidebar.tsx'];
test('no raw form controls remain anywhere in the svgedit area',()=>{
 const dir=new URL('./svgedit/',import.meta.url).pathname;
 for(const f of FILES){
  const src=readFileSync(join(dir,f),'utf8');
  assert.doesNotMatch(src,/<(button|input|select|textarea)\b/,`${f} still has a raw form control`);
  assert.match(src,/from '\.\.\/ui\/native-controls'/,`${f} must import native control primitives`);
 }
});
