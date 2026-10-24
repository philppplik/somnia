import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {panelField,panelFieldCompact,panelFieldMini,panelSection,panelSectionTitle,panelLabel,panelHint,panelHintPadded,panelSlider,panelCheck} from './panelStyles';

test('shared panel styles stay token-based (no hex, no raw pixel text sizes)',()=>{
 for(const value of [panelField,panelFieldCompact,panelFieldMini,panelSection,panelSectionTitle,panelLabel,panelHint,panelHintPadded,panelSlider,panelCheck]){
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(value),value);
  assert.ok(!/\btext-\[\d+(?:\.\d+)?px\]/.test(value)||value===panelSectionTitle||value===panelLabel,value);
 }
});

test('studio panels import the shared styles instead of redeclaring them',()=>{
 const duplicates=[
  'h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text',
  'h-7 w-full rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text',
  'grid gap-1.5 border-b border-subtle px-3 py-3 text-xs text-ink-2',
 ];
 const roots=['src/components/animation','src/components/video','src/components/sound','src/components/photos','src/components/vectorstudio','src/components/design'];
 const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):e.name.endsWith('.tsx')&&!e.name.includes('.test.')?[join(dir,e.name)]:[]);
 for(const root of roots)for(const file of walk(root)){
  const text=readFileSync(file,'utf8');
  forconst: for(const dup of duplicates){
   const occurrences=text.split(`'${dup}'`).length-1;
   assert.ok(occurrences<=1,`${file} redeclares a shared panel style; import it from components/shell/panelStyles`);
  }
 }
});
