import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const FILES=['photos/DevelopPanel.tsx','photos/PhotosInspector.tsx','photos/panels/HistoryPanel.tsx','photos/panels/PresetsPanel.tsx','photos/panels/shared.tsx'];
/** Pure host components: every control lives in the shared dialog they mount, so only the no-raw-controls rule applies to them. */
const HOSTS=['photos/PhotoExportPopover.tsx'];
test('no raw form controls remain anywhere in the photos area',()=>{
 const dir=new URL('./',import.meta.url).pathname;
 for(const f of [...FILES,...HOSTS]){
  const src=readFileSync(join(dir,f),'utf8');
  assert.doesNotMatch(src,/<(button|input|select|textarea)\b/,`${f} still has a raw form control`);
 }
 for(const f of FILES){
  const src=readFileSync(join(dir,f),'utf8');
  assert.match(src,/\.\.\/ui\/native-controls'/,`${f} must import native control primitives`);
 }
});
