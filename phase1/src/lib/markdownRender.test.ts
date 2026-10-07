import {test,before} from 'node:test';import assert from 'node:assert/strict';
import {renderMarkdown,renderMarkdownBlocks,safeUrl,loadMarkdown} from './markdownRender';
/** Matches an event-handler attribute inside a real (unescaped) tag. */
const live=(h:string)=>/<[a-z][^>]*\son[a-z]+\s*=/i.test(h.replace(/"[^"]*"/g,'""'));
before(async()=>{await loadMarkdown();});
test('headings, emphasis, code and lists',()=>{
 const h=renderMarkdown('# Title\n\nHello **bold** and *it* and `a<b`\n\n- one\n- two\n\n1. x\n2. y');
 assert.match(h,/<h1 [^>]*>Title<\/h1>/);assert.match(h,/<strong>bold<\/strong>/);assert.match(h,/<em>it<\/em>/);assert.match(h,/<code>a&lt;b<\/code>/);assert.match(h,/<ul [^>]*>\s*<li [^>]*>one<\/li>\s*<li [^>]*>two<\/li>\s*<\/ul>/);assert.match(h,/<ol [^>]*>\s*<li [^>]*>x<\/li>/);});
test('fenced code is escaped and not formatted',()=>{const h=renderMarkdown('```js\nconst a = "<b>"; **x**\n```');assert.match(h,/<pre><code [^>]*class="language-js">const a = &quot;&lt;b&gt;&quot;; \*\*x\*\*\n<\/code><\/pre>/);});
test('tables and blockquotes and rules',()=>{const h=renderMarkdown('| a | b |\n|---|:-:|\n| 1 | 2 |\n\n> quote\n\n---');assert.match(h,/<table[^>]*>[\s\S]*<th>a<\/th>\s*<th style="text-align:center">b<\/th>/);assert.match(h,/<td>1<\/td>/);assert.match(h,/<blockquote[^>]*>\s*<p[^>]*>quote<\/p>\s*<\/blockquote>/);assert.match(h,/<hr/);});
test('raw HTML and script are escaped',()=>{const h=renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');assert.doesNotMatch(h,/<script|<img/);assert.match(h,/&lt;script&gt;/);});
test('dangerous link and image schemes are dropped',()=>{
 const h=renderMarkdown('[x](javascript:alert(1)) [y](JaVa\tScript:alert(1)) [ok](https://a.test/?a=1&b=2) ![i](data:image/svg+xml;base64,AAA) ![j](https://evil.test/p.png)');
 assert.doesNotMatch(h,/<a [^>]*javascript/i);assert.doesNotMatch(h,/<a [^>]*data:/);assert.doesNotMatch(h,/<img/);assert.match(h,/<a href="https:\/\/a\.test\/\?a=1&amp;b=2">ok<\/a>/);});
test('attribute breakout is escaped',()=>{const h=renderMarkdown('[a](https://x.test/"onmouseover="alert(1))');assert.doesNotMatch(h,/onmouseover="/);});
test('images resolve only through the resolver',()=>{const h=renderMarkdown('![logo](img/a.png)',{resolveImage:s=>s==='img/a.png'?'blob:abc':null});assert.match(h,/<img src="blob:abc" alt="logo">/);assert.match(renderMarkdown('![x](nope.png)'),/md-missing-image/);});
test('safeUrl',()=>{assert.equal(safeUrl('javascript:x'),null);assert.equal(safeUrl(' https://a.test '),'https://a.test');assert.equal(safeUrl('docs/a.md'),'docs/a.md');assert.equal(safeUrl('//evil.test'),null);});
// Plugin and parser specific adversarial cases.
test('encoded, entity and mixed-case protocols are dropped',()=>{
 const h=renderMarkdown('[a](&#106;avascript:alert(1)) [b](JAVASCRIPT:alert(1)) [c](java&#x09;script:alert(1)) [d](vbscript:x) [e](data:text/html;base64,AAAA) [f](file:///etc/passwd) [g](<javascript:alert(1)>) [h](%6Aavascript:alert(1))');
 assert.doesNotMatch(h,/href="[^"]*(javascript|vbscript|data:|file:)/i);assert.doesNotMatch(h,/<a [^>]*href="[^#"]*script/i);});
test('reference-style and autolink dangerous targets are dropped',()=>{
 const h=renderMarkdown('[x][r]\n\n[r]: javascript:alert(1)\n\n<javascript:alert(1)>\n\n<https://ok.test>');
 assert.doesNotMatch(h,/href="javascript/i);assert.match(h,/href="https:\/\/ok\.test"/);});
test('nested constructs stay inert',()=>{
 const h=renderMarkdown('> - **[x](javascript:alert(1))** <b onmouseover=alert(1)>hi</b>\n> 1. ![a" onerror="alert(1)](x.png "t\\" onload=\\"alert(1)")');
 assert.doesNotMatch(h,/<b[ >]/);assert.ok(!live(h));assert.doesNotMatch(h,/href="javascript/i);assert.match(h,/&lt;b onmouseover/);});
test('image alt and title cannot break out of attributes',()=>{
 const h=renderMarkdown('![x" onerror="alert(1)](a.png "ti\\"tle onload=alert(1)")',{resolveImage:()=>'blob:ok'});
 assert.ok(!live(h));assert.match(h,/<img src="blob:ok"/);});
test('resolver output is escaped',()=>{const h=renderMarkdown('![a](a.png)',{resolveImage:()=>'blob:x" onerror="alert(1)'});assert.ok(!live(h));});
test('code fence info string cannot inject attributes',()=>{const h=renderMarkdown('```js" onclick="alert(1)\nx\n```');assert.ok(!live(h));});
test('task list checkboxes are disabled and produced by the renderer',()=>{
 const h=renderMarkdown('- [x] done\n- [ ] open\n- [ ]no space');assert.equal((h.match(/<input type="checkbox" disabled/g)??[]).length,2);assert.match(h,/disabled checked>/);
 assert.doesNotMatch(renderMarkdown('<input type="checkbox" checked>'),/<input/);});
test('footnotes stay in the document and links are in-page fragments',()=>{
 const h=renderMarkdown('Text[^a]\n\n[^a]: note [x](javascript:alert(1))');assert.match(h,/href="#fn1"/);assert.match(h,/href="#fnref1"/);assert.doesNotMatch(h,/href="javascript/i);});
test('duplicate headings get stable deterministic ids',()=>{
 const a=renderMarkdown('# Intro\n\n## Intro\n\n## Intro');const b=renderMarkdown('# Intro\n\n## Intro\n\n## Intro');assert.equal(a,b);
 assert.deepEqual([...a.matchAll(/id="([^"]+)"/g)].map(m=>m[1]),['intro','intro-1','intro-2']);});
test('forged ids and mapping attributes in source are inert text',()=>{
 const src='<h1 id="evil" data-md="0-99">x</h1>\n\n<p data-md="5-6">y</p>\n\n# Real';const h=renderMarkdown(src);
 assert.doesNotMatch(h,/<h1 id="evil"/);assert.match(h,/&lt;h1 id=&quot;evil&quot; data-md=&quot;0-99&quot;&gt;/);
 const m=[...h.matchAll(/data-md="(\d+)-(\d+)"/g)].map(x=>[+x[1],+x[2]]);assert.ok(m.every(([_s,e])=>e<=src.split('\n').length));});
test('block mapping covers headings, lists, quotes, fences, tables and footnotes',()=>{
 const src='# H\n\n- a\n  - b\n\n> q\n\n```js\ncode\n```\n\n| a |\n|---|\n| 1 |\n\nx[^1]\n\n[^1]: note';
 const {blocks}=renderMarkdownBlocks(src);const lines=src.split('\n');const covered=new Set<number>();blocks.forEach(b=>{for(let i=b.start;i<b.end;i++)covered.add(i);});
 lines.forEach((l,i)=>{if(l.trim())assert.ok(covered.has(i),`line ${i+1} "${l}" not mapped`);});
 assert.ok(blocks.every(b=>b.start>=0&&b.end>b.start&&b.end<=lines.length));});
test('no remote resources are produced',()=>{const h=renderMarkdown('![a](https://evil.test/p.png) ![b](//evil.test/p.png) [c](https://ok.test)');assert.doesNotMatch(h,/<img|src=/);});
