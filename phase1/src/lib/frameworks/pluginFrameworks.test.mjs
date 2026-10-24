import {test} from 'node:test';import assert from 'node:assert/strict';
import {parse as parseVue} from 'vue/compiler-sfc';import {parse as parseSvelte} from 'svelte/compiler';
import {instrumentSource,instrumentVue,instrumentSvelte} from './templates/somnia-vite-plugin.mjs';
const root='/project';
test('vue markers go on plain elements only, with real line numbers',()=>{
 const src=`<script setup lang="ts">\nimport {ref} from 'vue';\nconst n=ref(0);\n</script>\n\n<template>\n  <main>\n    <h1 class="a">Hi</h1>\n    <Comp/>\n    <slot/>\n    <template v-if="n"><p>{{ n }}</p></template>\n    <svg viewBox="0 0 1 1"><path d="M0 0"/></svg>\n  </main>\n</template>\n`;
 const out=instrumentVue(src,'/project/src/App.vue',root,parseVue);
 assert.match(out,/<main data-somnia-src="src\/App.vue:7">/);assert.match(out,/<h1 data-somnia-src="src\/App.vue:8" class="a">/);
 assert.match(out,/<p data-somnia-src="src\/App.vue:11">/);assert.match(out,/<svg data-somnia-src="src\/App.vue:12" viewBox/);
 assert.match(out,/<Comp\/>/);assert.match(out,/<slot\/>/);assert.match(out,/<template v-if="n">/);
 assert.ok(out.startsWith('<script setup lang="ts">'));
 assert.equal(instrumentVue(out,'/project/src/App.vue',root,parseVue),out,'idempotent');
 const compiled=parseVue(out,{filename:'App.vue'});assert.equal(compiled.errors.length,0);
});
test('vue skips files outside the project, node_modules, queries and templates without markup',()=>{
 const src='<template><p>x</p></template>';
 for(const id of ['/other/App.vue','/project/node_modules/a/App.vue','/project/src/App.vue?vue&type=style','/project/src/App.txt'])assert.equal(instrumentVue(src,id,root,parseVue),src,id);
 const noTemplate='<script>export default {render(){}}</script>';assert.equal(instrumentVue(noTemplate,'/project/src/A.vue',root,parseVue),noTemplate);
});
test('svelte markers cover blocks and nested elements but not components, script or style',()=>{
 const src=`<script lang="ts">\n  let n = $state(0);\n</script>\n\n<main>\n  <h1>Hi</h1>\n  {#if n}<p>x</p>{:else}<b>b</b>{/if}\n  {#each [1,2] as i}<li>{i}</li>{/each}\n  <Comp><i>c</i></Comp>\n  <button onclick={() => n++}>go</button>\n</main>\n<style>\n  h1 { color: red; }\n</style>\n`;
 const out=instrumentSvelte(src,'/project/src/App.svelte',root,parseSvelte);
 for(const [tag,line] of [['main',5],['h1',6],['p',7],['b',7],['li',8],['i',9],['button',10]])assert.match(out,new RegExp(`<${tag} data-somnia-src="src/App.svelte:${line}"`),tag);
 assert.match(out,/<Comp>/);assert.match(out,/<style>\n  h1 \{ color: red; \}/);assert.match(out,/let n = \$state\(0\);/);
 assert.equal(instrumentSvelte(out,'/project/src/App.svelte',root,parseSvelte),out,'idempotent');
 parseSvelte(out,{modern:true});
 for(const id of ['/other/App.svelte','/project/node_modules/x/App.svelte','/project/src/App.svelte?svelte&type=style','/project/src/App.js'])assert.equal(instrumentSvelte(src,id,root,parseSvelte),src,id);
});
test('solid JSX uses the same marker path as react and keeps signals untouched',()=>{
 const src=`import {createSignal} from 'solid-js';\nexport default function App(){\n  const [c,set]=createSignal(0);\n  return <main>\n    <button onClick={()=>set(n=>n+1)}>{c()}</button>\n    <Show when={c()}><p>y</p></Show>\n  </main>;\n}\n`;
 const out=instrumentSource(src,'/project/src/App.tsx',root);
 assert.match(out,/<main data-somnia-src="src\/App.tsx:4">/);assert.match(out,/<button data-somnia-src="src\/App.tsx:5" onClick/);assert.match(out,/<p data-somnia-src="src\/App.tsx:6">/);assert.match(out,/<Show when/);
});
test('a syntax error in markup is left to the framework compiler',()=>{
 assert.throws(()=>instrumentSvelte('<main>{#if}</main>','/project/src/App.svelte',root,parseSvelte));
});
