import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHORTCUTS,setShortcutsOpen,shortcutsOpen} from './shortcuts';
const LOCALES=['en','de','es','fr','pt-BR'];
test('every shortcut label exists in all five locales and no key combination repeats',()=>{
 for(const l of LOCALES){const m=JSON.parse(readFileSync(new URL(`../../locales/${l}.json`,import.meta.url),'utf8')) as Record<string,string>;
  for(const [k] of SHORTCUTS)assert.ok(m[k],`${l}: ${k}`);
  for(const k of ['documents.shortcuts.title','documents.shortcuts.open','documents.shortcuts.close','documents.shortcuts.mac','documents.session.linkCopied'])assert.ok(m[k],`${l}: ${k}`);}
 const keys=SHORTCUTS.map(s=>s[1]);assert.equal(new Set(keys).size,keys.length);
});
test('the dialog opens and closes',()=>{setShortcutsOpen(true);assert.equal(shortcutsOpen(),true);setShortcutsOpen(false);assert.equal(shortcutsOpen(),false);});
