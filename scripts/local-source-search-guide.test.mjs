import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('search guide and milestone keep release and synthetic acceptance limits explicit',()=>{
 const guide=read('docs/guide/local-source-search.md'),milestone=read('docs/ai/LOCAL-SOURCE-SEARCH-MILESTONE.md');
 for(const text of [guide,milestone]){
  assert.match(text,/Status: \*\*In development\*\*/);
  assert.match(text,/generated answers/i);
  assert.match(text,/memory-only/i);
  assert.match(text,/synthetic/i);
 }
 assert.match(guide,/No query embedding/);
 assert.match(guide,/full selected texts, not only the visible excerpts/);
 assert.match(guide,/Empty means no candidates, never all/);
 assert.match(guide,/no displayed citation rank/);
 assert.match(guide,/no line or selection is claimed/);
 assert.match(milestone,/not production acceptance or release sign-off/);
 assert.match(milestone,/native\/Rust\/WASM\/full desktop in CI/);
});
test('guide entrypoints link to one English search instructions home',()=>{
 for(const path of ['docs/guide/README.md','docs/guide/ai-and-collaboration.md','docs/ai/LOCAL-AI-IN-SOMNIA.md','docs/ai/LOCAL-AI-IN-SOMNIA.de.md'])assert.match(read(path),/local-source-search\.md/);
 assert.match(read('docs/ai/LOCAL-SOURCE-SEARCH-MILESTONE.md'),/\.\.\/guide\/local-source-search\.md/);
});
