import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import {extractMath,hasMathDelims} from './mathExtract';
import {_resetMathForTests,_setKatexForTests,makeSink,renderMath} from './mathRender';
import {loadMarkdown,renderMarkdown,renderMarkdownEx} from './markdownRender';
import {renderTex} from './texPreview';
import {mathProblems} from './mathProblems';
import {modeFor,languageFor} from './languages';
import {EditorState} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
test.before(async()=>{await loadMarkdown();});
test.beforeEach(()=>{_resetMathForTests();_setKatexForTests(katex);});
const items=(s:string)=>extractMath(s).items.map(i=>`${i.display?'D':'I'}:${i.tex}`);
test('inline and block delimiters',()=>{
 assert.deepEqual(items('a $x^2$ b \\(y\\) c'),['I:x^2','I:y']);
 assert.deepEqual(items('$$\\int_0^1 x\\,dx$$'),['D:\\int_0^1 x\\,dx']);
 assert.deepEqual(items('\\[a+b\\]'),['D:a+b']);
 assert.deepEqual(items('$$\na=b\n$$'),['D:a=b']);});
test('price-like dollars stay text',()=>{
 for(const s of ['5 $ und 7 $','It costs $5 or $10.','$5 and $10','pay $ 5 and $ 6','between $20 and $30 total'])assert.deepEqual(items(s),[],s);
 assert.deepEqual(items('costs $5 or $x$'),['I:x']);
 assert.equal(extractMath('Price \\$5 and \\$6').text,'Price $5 and $6');});
test('code spans and fences are skipped',()=>{
 assert.deepEqual(items('use `$x^2$` here'),[]);
 assert.deepEqual(items('```\n$x$\n$$y$$\n```\n$z$'),['I:z']);
 assert.deepEqual(items('~~~tex\n$x$\n~~~'),[]);});
test('unclosed $$ is a warning and does not swallow the rest',()=>{
 const r=extractMath('intro\n\n$$ a = b\n\nlater $x$ stays');
 assert.equal(r.warnings.length,1);assert.equal(r.warnings[0].line,3);assert.deepEqual(r.items.map(i=>i.tex),['x']);
 assert.ok(r.text.includes('later'));});
test('line numbers point at the opening delimiter',()=>{const r=extractMath('a\n\nb $x$\n$$\ny\n$$');assert.deepEqual(r.items.map(i=>i.line),[3,4]);});
test('hasMathDelims is a cheap pre-check',()=>{assert.ok(hasMathDelims('a $x$'));assert.ok(hasMathDelims('\\[x\\]'));assert.ok(!hasMathDelims('plain text'));assert.ok(!hasMathDelims('5 $ and 7 $'));});
test('markdown renders formulas with aria-label and keeps code literal',()=>{
 const sink=makeSink();const html=renderMarkdown('# T $a_1$\n\nText $x^2$ and `$y$`\n\n$$E=mc^2$$\n',{math:sink});
 assert.match(html,/class="math-inline" role="math" aria-label="x\^2"/);assert.match(html,/class="math-block"/);assert.ok(html.includes('<code>$y$</code>'));
 assert.equal(sink.count,3);assert.equal(sink.errors.length,0);assert.ok(html.includes('class="katex"'));assert.ok(!html.includes('katex-mathml'));});
test('markdown without a sink leaves dollars alone',()=>{assert.equal(renderMarkdown('cost $x$').replace(/ data-md="[^"]*"/g,'').trim(),'<p>cost $x$</p>');});
test('underscores and stars inside math are not turned into emphasis',()=>{const html=renderMarkdown('$a_1 + b_2$ and *em*',{math:makeSink()});assert.ok(!html.includes('<em>1'));assert.match(html,/<em>em<\/em>/);});
test('one bad formula does not break the page',()=>{
 const sink=makeSink();const html=renderMarkdown('ok $x$ bad $\\frac{1}{$ ok2 $y$',{math:sink});
 assert.equal(sink.errors.length,1);assert.match(html,/class="math-error"/);assert.equal((html.match(/class="math-inline"/g)||[]).length,2);
 assert.match(sink.errors[0].message,/^Math: /);});
test('blocked commands are refused with a security message',()=>{
 for(const tex of ['\\href{javascript:alert(1)}{x}','\\url{http://x.y}','\\includegraphics{a.png}','\\htmlClass{a}{b}']){
  const r=renderMath(tex,false)!;assert.ok(r.error,tex);assert.match(r.error!,/disabled in Somnia \(security\)/);assert.ok(!r.html.includes('href'));}});
test('HTML in formulas and XSS attempts stay inert',()=>{
 const html=renderMarkdown('$<img src=x onerror=alert(1)>$ and $\\href{javascript:alert(1)}{x}$',{math:makeSink()});
 assert.ok(!/<img/i.test(html));assert.ok(!/href=/i.test(html));assert.ok(!/<script/i.test(html));});
test('block error shows the message',()=>{const sink=makeSink();const html=renderMarkdown('$$\\foo$$',{math:sink});assert.match(html,/math-error-block/);assert.equal(sink.errors.length,1);});
test('engine not loaded: skeletons and pending flag',()=>{_resetMathForTests();const sink=makeSink();const html=renderMarkdown('a $x$ b\n\n$$y$$',{math:sink});assert.ok(sink.pending);assert.match(html,/math-skel/);assert.match(html,/math-skel-block/);});
test('formula cache is keyed by source and display mode',()=>{const a=renderMath('x',false)!,b=renderMath('x',false)!,c=renderMath('x',true)!;assert.strictEqual(a,b);assert.notStrictEqual(a,c);});
test('error line adds the KaTeX offset',()=>{const sink=makeSink();sink.fn({tex:'a\n\\frac{1}{',display:true,line:5});assert.ok(sink.errors[0].line>=5);});
test('unclosed $$ is reported as warning by renderMarkdownEx',()=>{assert.equal(renderMarkdownEx('$$ x',{math:makeSink()}).warnings.length,1);});
test('mathProblems: md errors and tex errors, only when ready',()=>{
 const p=mathProblems('a.md','ok $x$\n\nbad $\\frac{1}{$');assert.equal(p.length,1);assert.equal(p[0].line,3);assert.equal(p[0].severity,'error');assert.match(p[0].message,/^Math: /);
 assert.deepEqual(mathProblems('a.html','$\\frac$'),[]);
 const t=mathProblems('a.tex','\\begin{document}\nHello $\\foo$\n\\end{document}');assert.equal(t.length,1);assert.equal(t[0].line,2);
 _resetMathForTests();assert.deepEqual(mathProblems('a.md','$\\frac{1}{$'),[]);});
test('tex preview: body, headings, lists, text commands, equations',()=>{
 const src='\\documentclass{article}\n\\usepackage{amsmath}\n% comment $z$\n\\begin{document}\n\\section{Intro}\nHello \\textbf{bold} and \\emph{it}, $a^2$.\n\n\\subsection{Deep}\n\\begin{itemize}\n\\item one\n\\item two \\begin{enumerate}\\item inner\\end{enumerate}\n\\end{itemize}\n\\begin{equation}\nE=mc^2\n\\end{equation}\n\\begin{align*}\na&=b\\\\c&=d\n\\end{align*}\n\\cite{x}\n\\end{document}';
 const sink=makeSink();const r=renderTex(src,sink);
 assert.match(r.html,/<h2 class="tex-sec">1 Intro/);assert.match(r.html,/<h3 class="tex-sec">1\.1 Deep/);assert.match(r.html,/<strong>bold<\/strong>/);assert.match(r.html,/<em>it<\/em>/);
 assert.equal((r.html.match(/<li>/g)||[]).length,3);assert.match(r.html,/\(1\)<\/span>/);assert.equal((r.html.match(/tex-eqno/g)||[]).length,1);
 assert.ok(!r.html.includes('z$'));assert.ok(r.ignored.includes('\\usepackage{amsmath}'));assert.ok(r.ignored.some(x=>x.startsWith('\\cite')));assert.equal(sink.errors.length,0);assert.equal(sink.count,3);});
test('tex preview without document env renders the whole file; never executes input',()=>{
 const r=renderTex('Hi $x$\n\\input{secret}\n\\write18{ls}',makeSink());assert.match(r.html,/math-inline/);assert.ok(r.ignored.some(x=>x.startsWith('\\input')));assert.ok(r.ignored.some(x=>x.startsWith('\\write')));assert.ok(!/secret/.test(r.html));});
test('tex preview escapes HTML and escaped specials',()=>{const r=renderTex('a <b> \\& 50\\% \\$',makeSink());assert.ok(r.html.includes('&lt;b&gt;'));assert.ok(r.html.includes('&amp;'));assert.ok(r.html.includes('50%'));});
test('.tex mode and highlighting',()=>{
 assert.equal(modeFor('paper.tex'),'tex');
 const doc='% note\n\\begin{document}\n\\section{A} $x$\n\\begin{equation}\na\n\\end{equation}\n\\end{document}';
 const st=EditorState.create({doc,extensions:[languageFor('paper.tex')]});
 let found=0;syntaxTree(st).iterate({enter:()=>{found++;}});assert.ok(found>1);});

test('error messages are plain text and name the command',()=>{const a=renderMath('\\frac{1}{',false)!;assert.ok(!a.error!.includes('&#'));const b=renderMath('\\unknowncmd{x}',true)!;assert.match(b.error!,/\\unknowncmd/);});

test('markdown-it: multi-line math keeps source line maps, prices and code stay text, no markers leak',()=>{
 const sink=makeSink();const html=renderMarkdown('para $a\nb$ x\n\n$$\nE=mc^2\n$$\n\nafter costs $5 or $10\n\n```\n$z$\n```\n\nlast',{math:sink});
 assert.equal(sink.count,2);assert.ok(!/[\u0001\u0002]/.test(html));
 assert.match(html,/data-md="0-2"/);assert.match(html,/data-md="3-6"/);assert.match(html,/data-md="7-8"[^>]*>after costs \$5 or \$10/);assert.match(html,/data-md="13-14"[^>]*>last/);assert.ok(html.includes('$z$'));});
test('markdown-it: math in link titles and image alt never reaches an attribute',()=>{
 const html=renderMarkdown('[a](https://x.y "t $x$") ![alt $y$](p.png) # h',{math:makeSink()});
 assert.ok(!/(title|alt)="[^"]*math-inline/.test(html));assert.ok(!/[\u0001\u0002]/.test(html));});
test('markdown-it: headings with math get stable ids, warnings are reported',()=>{
 const r=renderMarkdownEx('# T $a_1$\n\n$$ open',{math:makeSink()});assert.match(r.html,/<h1 [^>]*id="t"/);assert.equal(r.warnings.length,1);});
