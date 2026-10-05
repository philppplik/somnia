import {test} from 'node:test';import assert from 'node:assert/strict';
import {renderMarkdown,safeUrl} from './markdownRender';
test('headings, emphasis, code and lists',()=>{
 const h=renderMarkdown('# Title\n\nHello **bold** and *it* and `a<b`\n\n- one\n- two\n\n1. x\n2. y');
 assert.match(h,/<h1>Title<\/h1>/);assert.match(h,/<strong>bold<\/strong>/);assert.match(h,/<em>it<\/em>/);assert.match(h,/<code>a&lt;b<\/code>/);assert.match(h,/<ul><li>one<\/li><li>two<\/li><\/ul>/);assert.match(h,/<ol><li>x<\/li><li>y<\/li><\/ol>/);});
test('fenced code is escaped and not formatted',()=>{const h=renderMarkdown('```js\nconst a = "<b>"; **x**\n```');assert.match(h,/<pre><code class="language-js">const a = &quot;&lt;b&gt;&quot;; \*\*x\*\*<\/code><\/pre>/);});
test('tables and blockquotes and rules',()=>{const h=renderMarkdown('| a | b |\n|---|:-:|\n| 1 | 2 |\n\n> quote\n\n---');assert.match(h,/<table><thead><tr><th>a<\/th><th style="text-align:center">b<\/th>/);assert.match(h,/<td>1<\/td>/);assert.match(h,/<blockquote><p>quote<\/p><\/blockquote>/);assert.match(h,/<hr>/);});
test('raw HTML and script are escaped',()=>{const h=renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');assert.doesNotMatch(h,/<script|<img/);assert.match(h,/&lt;script&gt;/);});
test('dangerous link and image schemes are dropped',()=>{
 const h=renderMarkdown('[x](javascript:alert(1)) [y](JaVa\tScript:alert(1)) [ok](https://a.test/?a=1&b=2) ![i](data:image/svg+xml;base64,AAA) ![j](https://evil.test/p.png)');
 assert.doesNotMatch(h,/javascript/i);assert.doesNotMatch(h,/<a [^>]*data:/);assert.doesNotMatch(h,/<img/);assert.match(h,/<a href="https:\/\/a\.test\/\?a=1&amp;b=2">ok<\/a>/);});
test('attribute breakout is escaped',()=>{const h=renderMarkdown('[a](https://x.test/"onmouseover="alert(1))');assert.doesNotMatch(h,/onmouseover="/);});
test('images resolve only through the resolver',()=>{const h=renderMarkdown('![logo](img/a.png)',{resolveImage:s=>s==='img/a.png'?'blob:abc':null});assert.match(h,/<img src="blob:abc" alt="logo">/);assert.match(renderMarkdown('![x](nope.png)'),/md-missing-image/);});
test('safeUrl',()=>{assert.equal(safeUrl('javascript:x'),null);assert.equal(safeUrl(' https://a.test '),'https://a.test');assert.equal(safeUrl('docs/a.md'),'docs/a.md');assert.equal(safeUrl('//evil.test'),null);});
