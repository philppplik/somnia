// Locks the reduced-motion guards: the app-wide CSS guard in global.css and the
// standalone prototype-preview guard in lib/interface/prototype.ts. If someone
// deletes or renames either guard, vestibular-safety coverage silently drops.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const here=(p)=>new URL(p,import.meta.url);

test('global.css keeps the app-wide prefers-reduced-motion guard',()=>{
 const css=readFileSync(here('./global.css'),'utf8');
 assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'),'media query missing');
 assert.ok(css.includes('animation:none!important'),'animation kill missing');
 assert.ok(css.includes('transition:none!important'),'transition kill missing');
 assert.ok(css.includes('scroll-behavior:auto!important'),'scroll-behavior pin missing');
});

test('standalone prototype preview HTML keeps its own reduced-motion guard',()=>{
 const src=readFileSync(here('../lib/interface/prototype.ts'),'utf8');
 assert.ok(src.includes('@media (prefers-reduced-motion:reduce)'),'preview guard missing');
 assert.ok(src.includes('.anim-fade,.anim-left,.anim-right,.anim-up,.anim-down{animation:none;}'),'preview anim kill missing');
});
