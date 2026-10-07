import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {loadMarkdown,renderMarkdown,safeUrl,renderMarkdownBlocks} from './markdownRender';
before(async()=>{await loadMarkdown();});

for(const url of ['javascript:alert(1)','JaVaScRiPt:alert(1)','java\tscript:alert(1)','java\nscript:x','\u0000javascript:x','vbscript:x','data:text/html,hi','file:///etc/passwd','blob:evil','ftp://evil.test','custom+scheme:x','//evil.test/p.png']){
 test(`safeUrl rejects forbidden scheme ${JSON.stringify(url)}`,()=>assert.equal(safeUrl(url),null));
}
for(const [raw,expected] of [[' https://example.com/a ','https://example.com/a'],['HTTP://example.com','HTTP://example.com'],['mailto:a@example.com','mailto:a@example.com'],['#section-1','#section-1'],['docs/readme.md#intro','docs/readme.md#intro'],['../media/logo.png','../media/logo.png']] as const){
 test(`safeUrl preserves allowed target ${raw}`,()=>assert.equal(safeUrl(raw),expected));
}
test('safeUrl returns null for empty / whitespace-only values',()=>{
 for(const raw of ['',' \t\n','\u0000\u007f'])assert.equal(safeUrl(raw),null);
});
for(const target of ['https://evil.test/track.png','hTtPs://evil.test/track.png','http://evil.test/track.png','//evil.test/track.png','%2F%2Fevil.test/track.png','https%3A%2F%2Fevil.test/track.png','https&#58;//evil.test/track.png','mailto:evil@example.com','#image','data:image/png;base64,AAA','file:///secret.png']){
 test(`remote / nonproject image never reaches the trusted resolver: ${target}`,()=>{
  const calls:string[]=[];const html=renderMarkdown(`![remote](${target})`,{resolveImage:src=>{calls.push(src);return 'blob:should-not-exist';}});
  assert.deepEqual(calls,[]);assert.doesNotMatch(html,/<img\b|\ssrc=/i);
 });
}
test('reference images use exact full project paths, not basename or remote fallbacks',()=>{
 const calls:string[]=[];const html=renderMarkdown('![local][l] ![missing][m] ![remote][r]\n\n[l]: images/nested/logo.png\n[m]: other/logo.png\n[r]: https://evil.test/logo.png',{
  resolveImage:src=>{calls.push(src);return src==='images/nested/logo.png'?'blob:local':null;},
 });
 assert.deepEqual(calls,['images/nested/logo.png','other/logo.png']);
 assert.equal((html.match(/<img\b/g)??[]).length,1);assert.match(html,/src="blob:local"/);
 assert.equal((html.match(/md-missing-image/g)??[]).length,2);
});
for(const target of ['%6Aavascript:alert(1)','java%09script:alert(1)','&#106;avascript:alert(1)','java&#x0a;script:alert(1)','data%3Atext/html,hi','%2F%2Fevil.test/x']){
 test(`encoded link policy blocks ${target}`,()=>{
  const html=renderMarkdown(`[x](<${target}>)`);assert.doesNotMatch(html,/<a\b[^>]*href="(?!#)/i);
 });
}
test('author-provided mapping attributes and ids cannot become trusted DOM metadata',()=>{
 const source='<div data-md="99-100" id="intro" onclick="x()">fake</div>\n\n# Intro\n\n# Intro\n\n# Intro-1';
 const {html,blocks}=renderMarkdownBlocks(source);
 assert.doesNotMatch(html,/<div\b|<[a-z][^>]*\sonclick=/i);assert.doesNotMatch(html,/data-md="99-100"/);
 assert.deepEqual([...html.matchAll(/<h1[^>]*id="([^"]+)"/g)].map(m=>m[1]),['intro','intro-1','intro-1-1']);
 assert.ok(blocks.every(b=>b.end<=source.split('\n').length));
 assert.equal(renderMarkdown(source),html);
});
test('footnote and task plugins cannot introduce remote images or executable HTML',()=>{
 const calls:string[]=[];const html=renderMarkdown('- [x] **task**[^n]\n\n[^n]: ![spy](https://evil.test/x.png) <iframe src="https://evil.test"></iframe> [bad](javascript:x)',{resolveImage:s=>{calls.push(s);return 'blob:x';}});
 assert.deepEqual(calls,[]);assert.doesNotMatch(html,/<img\b|<iframe\b|href="javascript:/i);
 assert.match(html,/<input type="checkbox" disabled checked>/);assert.match(html,/href="#fn1"/);assert.match(html,/href="#fnref1"/);
});
