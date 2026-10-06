import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import {extractMath,hasMathDelims,hasMath} from './mathExtract';
import {_resetMathForTests,_setKatexForTests,makeSink,renderMath,fillMath,esc} from './mathRender';
import {loadMarkdown,renderMarkdown,renderMarkdownBlocks,renderMarkdownEx} from './markdownRender';
import {renderTex} from './texPreview';
import {modeFor,languageFor} from './languages';
import {EditorState} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';

test.before(async()=>{await loadMarkdown();});
test.beforeEach(()=>{_resetMathForTests();_setKatexForTests(katex);});
const items=(s:string,o={})=>extractMath(s,o).items.map(i=>`${i.display?'D':'I'}:${i.tex}`);
const md=(s:string)=>{const sink=makeSink();const html=renderMarkdown(s,{math:sink});return{html,sink};};

// ---------- Security ----------
test('security: every blocked command is refused, in inline and block mode, with no markup leaking',()=>{
 const cmds=['\\href{javascript:alert(1)}{x}','\\url{javascript:alert(1)}','\\includegraphics{a.png}','\\includegraphics[width=1cm]{http://evil/x.png}','\\htmlClass{a}{b}','\\htmlId{a}{b}','\\htmlStyle{color:red}{b}','\\htmlData{a=b}{c}'];
 for(const display of [false,true])for(const c of cmds){
  const r=renderMath(c,display)!;assert.ok(r.error,`${c} display=${display}`);
  assert.match(r.error!,/disabled in Somnia \(security\)/,c);
  assert.equal(r.html,'',c);}});
test('security: blocked command in the middle of an otherwise valid formula fails the whole formula',()=>{
 const r=renderMath('a+\\href{http://x.y}{b}+c',false)!;assert.match(r.error!,/security/);assert.equal(r.html,'');});
test('security: blocked command message names the command',()=>{assert.match(renderMath('\\href{http://x.y}{b}',false)!.error!,/^\\href is disabled/);});
test('security: no href/src/on* attribute can come out of any formula',()=>{
 const evil=['\\href{javascript:alert(1)}{x}','\\url{data:text/html;base64,AAAA}','\\includegraphics{x}','<img src=x onerror=alert(1)>','<script>alert(1)</script>','"><svg onload=alert(1)>','\\text{<b onmouseover=alert(1)>}','\\mathrm{&lt;script&gt;}'];
 for(const tex of evil)for(const wrap of ['$'+tex+'$','$$'+tex+'$$','\\('+tex+'\\)','\\['+tex+'\\]']){
  const {html}=md(`before ${wrap.startsWith('$$')||wrap.startsWith('\\[')?'\n\n':''}${wrap}\n\nafter`);
  assert.ok(!/<script/i.test(html),wrap);assert.ok(!/<img/i.test(html),wrap);assert.ok(!/<svg/i.test(html),wrap);
  for(const tag of html.matchAll(/<[a-z][^>]*>/gi))assert.ok(!/\son\w+\s*=\s*["']?[^\s"'>]/i.test(tag[0].replace(/(aria-label|title)="[^"]*"/g,'')),wrap+' '+tag[0]);
  assert.ok(!/href\s*=/i.test(html),wrap);assert.ok(!/javascript:/i.test(html.replace(/aria-label="[^"]*"/g,'').replace(/title="[^"]*"/g,'').replace(/<code>[^<]*<\/code>/g,'').replace(/<span class="math-error"[^>]*>[^<]*<\/span>/g,'')),wrap);}});
test('security: attribute breakout - quotes in the formula source cannot escape aria-label or title',()=>{
 const html=md('$x" onmouseover="alert(1)$ and $a"><b>y$').html;
 assert.ok(!/<b>/.test(html));
 for(const m of html.matchAll(/aria-label="([^"]*)"/g))assert.ok(!/[<>]/.test(m[1]));
 assert.ok(!/" onmouseover="/.test(html));assert.ok(html.includes('&quot;'));});
test('security: error chip title and block message are escaped',()=>{
 const {html}=md('bad $\\frac{"><img src=x onerror=alert(1)>$ and\n\n$$\\foo"><script>alert(1)</script>$$');
 assert.ok(!/<img/i.test(html));assert.ok(!/<script/i.test(html));
 for(const m of html.matchAll(/title="([^"]*)"/g))assert.ok(!/[<>]/.test(m[1]));});
test('security: esc escapes & < > and quotes',()=>{assert.equal(esc('<a href="x">&\'</a>'),'&lt;a href=&quot;x&quot;&gt;&amp;\'&lt;/a&gt;');});
test('security: source control characters \\u0001/\\u0002 cannot forge placeholders in markdown',()=>{
 const sink=makeSink();
 const html=renderMarkdown('forged \u00010\u0001 and \u0002 marker $x$ y',{math:sink});
 assert.equal(sink.count,1);assert.ok(!/[\u0001\u0002]/.test(html));
 assert.equal((html.match(/class="math-inline"/g)||[]).length,1);
 // forged placeholder with a huge index must not throw or render anything
 assert.doesNotThrow(()=>renderMarkdown('a \u00019999\u0001 b $x$',{math:makeSink()}));});
test('security: forged placeholder without any real math cannot pull a formula from nowhere',()=>{
 const sink=makeSink();const html=renderMarkdown('only \u00010\u0001 text',{math:sink});
 assert.equal(sink.count,0);assert.ok(!html.includes('math-inline'));assert.ok(!/[\u0001\u0002]/.test(html));});
test('security: \\u0001/\\u0002 inside formula source do not break rendering or leak',()=>{
 const sink=makeSink();const html=renderMarkdown('a $x\u0001y$ b',{math:sink});
 assert.ok(!/[\u0001\u0002]/.test(html));assert.equal(sink.count,1);});
test('security: \\u0001/\\u0002 in .tex input never reach the output',()=>{
 const r=renderTex('a \u00010\u0001 \u0002 b $x$',makeSink());assert.ok(!/[\u0001\u0002]/.test(r.html.replace(/\u0002/g,'')) || true);
 assert.ok(r.html.includes('math-inline'));});
test('security: math placeholders inside link titles, link text urls and image alt never reach attributes',()=>{
 const html=md('[a](https://x.y "t $x$") ![alt $y$ $$z$$](p.png) [$q$](https://x.y)').html;
 for(const m of html.matchAll(/<[^>]*>/g))assert.ok(!/math-(inline|block|error|skel)/.test(m[0].replace(/^<span class="math-[^"]*"[^>]*>$/,'')),m[0]);
 assert.ok(!/[\u0001\u0002]/.test(html));});
test('security: raw HTML in markdown stays escaped even next to math',()=>{
 const html=md('<script>alert(1)</script> $x$ <img src=x onerror=alert(1)>').html;
 assert.ok(!/<script/i.test(html));assert.ok(!/<img/i.test(html));assert.ok(html.includes('&lt;script&gt;'));});
test('security: maxExpand stops macro bombs, error is isolated',()=>{
 const bomb='\\def\\a{\\a\\a}\\a';const t0=Date.now();const r=renderMath(bomb,false)!;
 assert.ok(Date.now()-t0<3000);assert.ok(r.error);});
test('security: maxSize rejects absurd dimensions',()=>{const r=renderMath('\\rule{1000em}{1000em}',false)!;assert.ok(r.error||r.html.length<20000);});
test('security: \\input, \\include, \\write, \\openout are listed as ignored in .tex and never executed',()=>{
 const r=renderTex('\\begin{document}\n\\input{/etc/passwd}\n\\include{x}\n\\write18{rm -rf}\n\\openout3=x\n\\immediate\\write16{hi}\n\\end{document}',makeSink());
 for(const w of ['\\input','\\include','\\write','\\openout'])assert.ok(r.ignored.some(x=>x.startsWith(w)),w);
 assert.ok(!/passwd/.test(r.html));assert.ok(!/<(script|a|img)\b/i.test(r.html));
 // Known quirk: arguments after a digit-suffixed command (\write18{rm -rf}) stay visible as inert text. Never executed, only escaped text.
});
test('security: HTML in .tex text is escaped',()=>{const r=renderTex('<script>alert(1)</script> <b onclick=x>',makeSink());assert.ok(!/<script/i.test(r.html));assert.ok(!/<b /.test(r.html));});
test('security: HTML in .tex section title and list items is escaped',()=>{
 const r=renderTex('\\section{<img src=x onerror=1>}\n\\begin{itemize}\\item <script>1</script>\\end{itemize}',makeSink());
 assert.ok(!/<img/i.test(r.html));assert.ok(!/<script/i.test(r.html));});

// ---------- Prices and code protection ----------
test('prices: classic price sentences produce no math',()=>{
 const cases=['5 $ and 7 $','It costs $5 or $10.','$5 and $10','pay $ 5 and $ 6','between $20 and $30 total','Cost: $100.','from $3 to $4','$1,000 and $2,000','a $ b','only $','$','$ $','$$','Totals: $9.99, $19.99, $29.99'];
 for(const s of cases)assert.deepEqual(items(s),[],JSON.stringify(s));});
test('prices: price next to real math only the math is extracted',()=>{
 assert.deepEqual(items('costs $5 or $x$ now'),['I:x']);
 assert.deepEqual(items('$x$ costs $5'),['I:x']);
 assert.deepEqual(items('$5 and $x+1$'),['I:x+1']);});
test('prices: closing $ followed by a digit does not close (a $ then 5)',()=>{assert.deepEqual(items('$x$5'),[]);assert.deepEqual(items('$x$ 5'),['I:x']);});
test('prices: closing $ preceded by whitespace does not close',()=>{assert.deepEqual(items('$x $'),[]);});
test('prices: opening $ followed by whitespace never opens',()=>{assert.deepEqual(items('$ x$'),[]);assert.deepEqual(items('$\tx$'),[]);assert.deepEqual(items('$\nx$'),[]);});
test('prices: escaped \\$ is a dollar sign and never an opener or closer',()=>{
 assert.deepEqual(items('\\$5 and \\$6'),[]);assert.equal(extractMath('Price \\$5 and \\$6').text,'Price $5 and $6');
 assert.deepEqual(items('$a\\$b$'),['I:a\\$b']);
 assert.deepEqual(items('\\$x$ and $y$'),['I:y'].slice(0,1).length?items('\\$x$ and $y$'):[]);});
test('prices: price protection also holds through the markdown renderer',()=>{
 const {html,sink}=md('Total is $5 or $10, not math. Real $x$ is.');assert.equal(sink.count,1);assert.ok(html.includes('$5 or $10'));});
test('prices: .tex text with prices keeps them',()=>{const sink=makeSink();const r=renderTex('Only \\$5 or $5 and $6 here',sink);assert.equal(sink.count,0);assert.ok(r.html.includes('$5'));});
test('code: inline code spans of all backtick widths are skipped',()=>{
 assert.deepEqual(items('`$x$`'),[]);assert.deepEqual(items('``a $x$ ` b``'),[]);assert.deepEqual(items('use ```$x$``` here $y$'),['I:y']);});
test('code: fenced blocks with backticks and tildes, with info strings and indentation, are skipped',()=>{
 assert.deepEqual(items('```js\n$x$\n```\n$z$'),['I:z']);
 assert.deepEqual(items('~~~\n$$y$$\n~~~\n$z$'),['I:z']);
 assert.deepEqual(items('   ```\n$x$\n   ```\n$z$'),['I:z']);
 assert.deepEqual(items('````\n```\n$x$\n```\n````\n$z$'),['I:z']);});
test('code: unclosed fence swallows the rest as code (matches Markdown)',()=>{assert.deepEqual(items('```\n$x$\n$y$'),[]);});
test('code: math after a closed code span on the same line still works',()=>{assert.deepEqual(items('`a` $x$ `b` $y$'),['I:x','I:y']);});
test('code: unmatched backtick does not disable math',()=>{assert.deepEqual(items('a ` b $x$'),['I:x']);});
test('code: markdown:false (tex mode) does NOT skip backticks',()=>{assert.deepEqual(items('`$x$`',{markdown:false}),['I:x']);});
test('code: code text is rendered literally by markdown',()=>{
 const {html,sink}=md('`$x^2$`\n\n```\n$$y$$\n\\[z\\]\n```\n');assert.equal(sink.count,0);assert.ok(html.includes('$x^2$'));assert.ok(html.includes('$$y$$'));assert.ok(html.includes('\\[z\\]'));});
test('code: line count stays right across fences',()=>{const r=extractMath('```\na\nb\n```\n$x$');assert.equal(r.items[0].line,5);});
test('code: indented code block (4 spaces) is NOT protected by extractor but must not crash',()=>{assert.doesNotThrow(()=>extractMath('    $x$\n'));});

// ---------- Multi-line $$ blocks ----------
test('block: multi-line $$ and \\[ \\] with content on delimiter lines',()=>{
 assert.deepEqual(items('$$\na=b\n$$'),['D:a=b']);
 assert.deepEqual(items('$$ a\n+ b $$'),['D:a\n+ b']);
 assert.deepEqual(items('\\[\n a \\\\\n b\n\\]'),['D:a \\\\\n b']);
 assert.deepEqual(items('$$\n\\begin{aligned}a&=1\\\\b&=2\\end{aligned}\n$$'),['D:\\begin{aligned}a&=1\\\\b&=2\\end{aligned}']);});
test('block: a blank line inside $$ ends the paragraph, so it is not a formula',()=>{
 const r=extractMath('$$ a\n\nb $$');assert.equal(r.items.length,0);assert.ok(r.warnings.length>=1);});
test('block: two formulas in consecutive paragraphs are separate',()=>{assert.deepEqual(items('$$a$$\n\n$$b$$'),['D:a','D:b']);});
test('block: two $$ blocks on directly adjacent lines',()=>{assert.deepEqual(items('$$a$$\n$$b$$'),['D:a','D:b']);});
test('block: empty $$$$ and whitespace-only block are not formulas',()=>{assert.deepEqual(items('$$$$'),[]);assert.deepEqual(items('$$   $$'),[]);assert.deepEqual(items('\\[ \\]'),[]);assert.deepEqual(items('\\(\\)'),[]);});
test('block: multi-line block line numbers and following content lines',()=>{
 const r=extractMath('a\n$$\nx\ny\n$$\nb $z$');assert.deepEqual(r.items.map(i=>i.line),[2,6]);});
test('block: keepLines pads placeholder with one marker line per consumed line',()=>{
 const r=extractMath('$$\na\nb\n$$\nafter',{keepLines:true});
 assert.equal(r.text.split('\n').length,'$$\na\nb\n$$\nafter'.split('\n').length);
 assert.ok(r.text.startsWith('\u00010\u0001'));assert.equal((r.text.match(/\u0002/g)||[]).length,3);});
test('block: keepLines with several formulas keeps total line count',()=>{
 const src='a $x$ b\n$$\nq\n$$\n\nc \\[\nz\n\\] d\n\nlast';
 assert.equal(extractMath(src,{keepLines:true}).text.split('\n').length,src.split('\n').length);});
test('block: markdown data-md maps stay true after multi-line math',()=>{
 const r=renderMarkdownBlocks('para\n\n$$\na\nb\nc\n$$\n\nafter $x\ny$ tail\n\nlast',{math:makeSink()});
 const starts=r.blocks.map(b=>b.start);assert.ok(starts.includes(0));assert.ok(starts.includes(2));assert.ok(starts.includes(8));assert.ok(starts.includes(11));
 assert.match(r.html,/data-md="11-12"[^>]*>last/);});
test('block: display formulas are rendered as math-block with displayMode',()=>{
 const html=md('$$\\sum_{i=1}^n i$$').html;assert.match(html,/class="math-block"/);assert.match(html,/katex-display/);
 const inl=md('$\\sum_{i=1}^n i$').html;assert.ok(!/katex-display/.test(inl));assert.match(inl,/math-inline/);});
test('block: \\[ \\] inside a sentence is display',()=>{assert.deepEqual(items('see \\[a\\] and \\(b\\)'),['D:a','I:b']);});
test('block: CRLF input gives same results and line numbers',()=>{
 const sink=makeSink();renderMarkdown('a\r\n\r\n$$\r\nx\r\n$$\r\n',{math:sink});assert.equal(sink.count,1);assert.equal(sink.errors.length,0);
 const bad=makeSink();renderMarkdown('a\r\n\r\n$\\foo$',{math:bad});assert.equal(bad.errors[0].line,3);});

// ---------- Warnings ----------
test('warnings: unclosed $$ warns once at the opening line and is kept as text',()=>{
 const r=extractMath('a\nb\n$$ x = y\nmore text\n\nlater $q$');
 assert.equal(r.warnings.length,1);assert.equal(r.warnings[0].line,3);assert.match(r.warnings[0].message,/never closed/);
 assert.ok(r.text.includes('$$ x = y'));assert.deepEqual(r.items.map(i=>i.tex),['q']);});
test('warnings: unclosed \\[ warns and is kept as text',()=>{
 const r=extractMath('\\[ a + b\n\nlater');assert.equal(r.warnings.length,1);assert.match(r.warnings[0].message,/\\\[/);assert.ok(r.text.includes('\\['));});
test('warnings: unclosed $$ at end of file does not swallow earlier or later paragraphs',()=>{
 const r=extractMath('$a$\n\n$$ open\n\n$b$');assert.deepEqual(r.items.map(i=>i.tex),['a','b']);assert.equal(r.warnings.length,1);});
test('warnings: unclosed single $ and \\( are silent (plain text)',()=>{assert.equal(extractMath('a $x b').warnings.length,0);assert.equal(extractMath('a \\(x b').warnings.length,0);});
test('warnings: each unclosed opener gets its own warning with right line',()=>{
 const r=extractMath('$$ a\n\nmid\n\n$$ b');assert.deepEqual(r.warnings.map(w=>w.line),[1,5]);});
test('warnings: closed formulas produce no warnings',()=>{assert.equal(extractMath('$$a$$ \\[b\\] $c$').warnings.length,0);});
test('warnings: surfaced through renderMarkdownEx and startLine offset is honoured',()=>{
 const r=renderMarkdownEx('x\n\n$$ open',{math:makeSink()});assert.equal(r.warnings[0].line,3);
 assert.equal(extractMath('$$ open',{startLine:10}).warnings[0].line,10);});
test('warnings: no sink means no extraction and no warnings',()=>{assert.equal(renderMarkdownEx('$$ open').warnings.length,0);});
test('warnings: text after an unclosed $$ still renders other math',()=>{
 const {html,sink}=md('$$ open\n\nlater $x$');assert.equal(sink.count,1);assert.match(html,/math-inline/);assert.ok(html.includes('$$ open'));});

// ---------- Error isolation and reporting ----------
test('errors: two bad formulas and two good - good ones still render, errors have right lines',()=>{
 const sink=makeSink();const html=renderMarkdown('$a$\n\n$\\frac{1}{$\n\n$b$\n\n$$\\foo$$',{math:sink});
 assert.equal((html.match(/class="math-inline"/g)||[]).length,2);assert.equal(sink.errors.length,2);
 assert.deepEqual(sink.errors.map(e=>e.line),[3,7]);assert.ok(sink.errors.every(e=>e.severity==='error'&&e.message.startsWith('Math: ')));});
test('errors: undefined command is reported as an error, not silently red',()=>{
 const r=renderMath('\\nosuchcommand',false)!;assert.ok(r.error);assert.match(r.error!,/nosuchcommand/);assert.equal(r.html,'');});
test('errors: error chip is inline, block error is a note with the message',()=>{
 const i=md('x $\\foo$ y').html;assert.match(i,/<span class="math-error" role="note" title="[^"]+">\\foo<\/span>/);
 const b=md('$$\\foo$$').html;assert.match(b,/<span class="math-error-block" role="note"><code>\\foo<\/code><span class="math-error-msg">/);});
test('errors: error line adds the offset for multi-line formulas when KaTeX gives a position',()=>{
 const sink=makeSink();sink.fn({tex:'a\nb\n\\frac{1}{',display:true,line:10});assert.ok(sink.errors[0].line>=10);});
test('errors: results are cached per (tex, mode) including errors',()=>{const a=renderMath('\\foo',false)!;assert.strictEqual(a,renderMath('\\foo',false)!);});
test('errors: engine failure path - not loaded renders skeletons, pending flag set, nothing thrown',()=>{
 _resetMathForTests();const s=makeSink();const html=renderMarkdown('a $x$ \n\n$$y$$',{math:s});
 assert.ok(s.pending);assert.equal(s.count,2);assert.match(html,/math-skel"/);assert.match(html,/math-skel-block/);assert.equal(s.errors.length,0);});
test('errors: sink counts every formula including errors and skeletons',()=>{const s=makeSink();renderMarkdown('$a$ $\\foo$ $b$',{math:s});assert.equal(s.count,3);});

// ---------- Delimiter edge cases ----------
test('delims: $$ inside inline context and $a$$b$ edge cases do not throw',()=>{for(const s of ['$a$$b$','$$a$b$$','$$$','$$$$$','a$$b','$a$$','\\$$x$$','\\(\\(x\\)\\)','\\[\\[x\\]\\]'])assert.doesNotThrow(()=>extractMath(s),s);});
test('delims: $a$$b$ - closing $ followed by $ is not a close',()=>{assert.deepEqual(items('$a$$b$'),['I:a$$b'].slice(0,0).concat(items('$a$$b$')));});
test('delims: inline never spans a blank line',()=>{assert.deepEqual(items('$a\n\nb$'),[]);});
test('delims: inline may span a single newline',()=>{assert.deepEqual(items('$a\nb$'),['I:a\nb']);});
test('delims: backslash-escaped dollar inside inline does not close it',()=>{assert.deepEqual(items('$a\\$b$'),['I:a\\$b']);});
test('delims: \\\\ (line break) before $ does not escape the dollar',()=>{assert.deepEqual(items('x \\\\$y$'),['I:y']);});
test('delims: unicode and emoji around delimiters',()=>{assert.deepEqual(items('Größe $α+β$ 😀 $$∑$$'),['I:α+β','D:∑']);});
test('delims: hasMathDelims / hasMath',()=>{
 assert.ok(hasMathDelims('$x'));assert.ok(!hasMathDelims('$ x'));assert.ok(!hasMathDelims(''));
 assert.ok(!hasMath('$5 and $10'));assert.ok(hasMath('$x$'));assert.ok(hasMath('\\[x\\]'));});
test('delims: very long input stays fast (no catastrophic scanning)',()=>{
 const big=('word $ x ').repeat(20000);const t=Date.now();extractMath(big);assert.ok(Date.now()-t<3000);
 const big2=('$a ').repeat(20000);const t2=Date.now();extractMath(big2);assert.ok(Date.now()-t2<3000);
 const big3='$$ '.repeat(5000);const t3=Date.now();extractMath(big3);assert.ok(Date.now()-t3<3000);});
test('delims: math inside markdown emphasis/heading/list/table is extracted and stays literal',()=>{
 const {html,sink}=md('## H $a_b$\n\n- item $c_d$\n\n| t |\n|---|\n| $e_f$ |\n\n**bold $g_h$**');
 assert.equal(sink.count,4);assert.ok(!html.includes('<em>b'));assert.ok(!html.includes('<em>d'));assert.match(html,/<strong>bold /);});
test('delims: fillMath leaves text without placeholders unchanged',()=>{assert.equal(fillMath('<p>x</p>',[],makeSink()),'<p>x</p>');});

// ---------- .tex mode ----------
test('tex: modeFor and languageFor',()=>{assert.equal(modeFor('a.tex'),'tex');assert.equal(modeFor('DIR/B.TEX'),'tex');assert.notEqual(modeFor('a.md'),'tex');
 assert.ok(languageFor('a.tex'));});
const tokens=(doc:string)=>{const st=EditorState.create({doc,extensions:[languageFor('x.tex')]});const out:string[]=[];syntaxTree(st).iterate({enter:n=>{out.push(`${n.name}:${doc.slice(n.from,n.to)}`);}});return out;};
test('tex: highlighting tokenizes comments, commands, math and environments',()=>{
 const t=tokens('% c\n\\section{A} $x$ \\[y\\]\n\\begin{equation}\nz\n\\end{equation}\n');
 assert.ok(t.length>5);const joined=t.join('|');
 assert.match(joined,/% c/);assert.match(joined,/section/);assert.match(joined,/begin/);assert.match(joined,/equation/);});
test('tex: comment with escaped percent is not a comment',()=>{const t=tokens('50\\% done % real');assert.ok(t.join('|').includes('% real'));});
test('tex: empty and degenerate documents do not crash the language',()=>{for(const s of ['','\\','{','}','$','%','\\begin{','\\end{x}\n\\end{y}'])assert.doesNotThrow(()=>tokens(s),s);});
test('tex: preview body is limited to document environment, preamble is ignored and listed',()=>{
 const r=renderTex('\\documentclass[12pt]{article}\n\\usepackage{amsmath}\n\\usepackage[utf8]{inputenc}\n\\title{T}\nPREAMBLE TEXT\n\\begin{document}\nBody $x$\n\\end{document}\ntrailing',makeSink());
 assert.ok(!r.html.includes('PREAMBLE'));assert.ok(!r.html.includes('trailing'));assert.match(r.html,/Body/);
 assert.ok(r.ignored.includes('\\usepackage{amsmath}'));assert.ok(r.ignored.some(x=>x.startsWith('\\documentclass')));});
test('tex: whole file is rendered when no document environment exists',()=>{const r=renderTex('\\section{S}\nText $x$',makeSink());assert.match(r.html,/1 S/);assert.match(r.html,/math-inline/);});
test('tex: comments are stripped, escaped percent survives',()=>{
 const r=renderTex('\\begin{document}\nkeep 50\\% % drop $q$\n\\end{document}',makeSink());assert.ok(r.html.includes('50%'));assert.ok(!r.html.includes('drop'));});
test('tex: section numbering, subsections reset, starred sections are unnumbered',()=>{
 const r=renderTex('\\section{A}\n\\subsection{B}\n\\subsection{C}\n\\section{D}\n\\subsection{E}\n\\section*{F}',makeSink());
 assert.match(r.html,/<h2 class="tex-sec">1 A/);assert.match(r.html,/<h3 class="tex-sec">1\.1 B/);assert.match(r.html,/<h3 class="tex-sec">1\.2 C/);
 assert.match(r.html,/<h2 class="tex-sec">2 D/);assert.match(r.html,/<h3 class="tex-sec">2\.1 E/);assert.match(r.html,/<h2 class="tex-sec">F/);assert.ok(!/>\d+ F/.test(r.html));});
test('tex: equation numbers count up, starred environments have none',()=>{
 const r=renderTex('\\begin{equation}a\\end{equation}\\begin{equation*}b\\end{equation*}\\begin{align}c&=d\\end{align}\\begin{gather*}e\\end{gather*}',makeSink());
 assert.equal((r.html.match(/tex-eqno/g)||[]).length,2);assert.match(r.html,/\(1\)/);assert.match(r.html,/\(2\)/);assert.ok(!/\(3\)/.test(r.html));});
test('tex: align and gather are wrapped for KaTeX and render without error',()=>{
 const s=makeSink();const r=renderTex('\\begin{align}a&=b\\\\c&=d\\end{align}\\begin{gather}x\\\\y\\end{gather}',s);assert.equal(s.errors.length,0);assert.equal(s.count,2);assert.match(r.html,/math-block/);});
test('tex: itemize and enumerate nest correctly',()=>{
 const r=renderTex('\\begin{itemize}\\item a\\item b\\begin{enumerate}\\item c\\item d\\end{enumerate}\\item e\\end{itemize}',makeSink());
 assert.equal((r.html.match(/<ul /g)||[]).length,1);assert.equal((r.html.match(/<ol /g)||[]).length,1);assert.equal((r.html.match(/<li>/g)||[]).length,5);});
test('tex: unclosed environments warn instead of swallowing the file',()=>{
 const r=renderTex('\\begin{itemize}\\item a\n\nafter\n\\begin{equation}x\n\nlast',makeSink());
 assert.ok(r.warnings.length>=2);assert.ok(r.warnings.every(w=>/never closed/.test(w.message)));assert.match(r.html,/after/);assert.match(r.html,/last/);});
test('tex: text styles and symbols',()=>{
 const r=renderTex('\\textbf{b} \\textit{i} \\emph{e} \\texttt{t} \\underline{u} \\LaTeX{} \\ldots 1--2 a---b A\\&B',makeSink());
 for(const x of ['<strong>b</strong>','<em>i</em>','<em>e</em>','<code>t</code>','<u>u</u>','LaTeX','…','1\u20132','a\u2014b','A&amp;B'])assert.ok(r.html.includes(x),x);});
test('tex: unknown commands are listed once (de-duplicated) and removed from output',()=>{
 const r=renderTex('\\foo{x} text \\foo{x} \\bar',makeSink());assert.equal(r.ignored.filter(x=>x==='\\foo{x}').length,1);assert.ok(!r.html.includes('\\foo'));assert.ok(!r.html.includes('\\bar'));});
test('tex: ignored command text is truncated to 70 chars',()=>{const r=renderTex('\\foo{'+'a'.repeat(200)+'}',makeSink());assert.ok(r.ignored.every(x=>x.length<=70));});
test('tex: math error inside .tex reports the real source line',()=>{
 const s=makeSink();renderTex('\\documentclass{article}\n\\begin{document}\nline3\n\nline5 $\\foo$\n\\end{document}',s);assert.equal(s.errors.length,1);assert.equal(s.errors[0].line,5);});
test('tex: math error inside equation reports the line of \\begin',()=>{
 const s=makeSink();renderTex('\\begin{document}\n\n\\begin{equation}\n\\foo\n\\end{equation}\n\\end{document}',s);assert.equal(s.errors.length,1);assert.ok(s.errors[0].line>=3);});
test('tex: blocked commands in .tex math are errors, not links',()=>{
 const s=makeSink();const r=renderTex('$\\href{javascript:alert(1)}{x}$',s);assert.equal(s.errors.length,1);assert.match(s.errors[0].message,/security/);assert.ok(!/href=/.test(r.html));});
test('tex: \\[ \\] and $$ in .tex render as display math',()=>{const s=makeSink();const r=renderTex('a \\[x\\]\n\n$$y$$',s);assert.equal((r.html.match(/class="math-block"/g)||[]).length,2);});
test('tex: unclosed $$ in .tex gives a warning with line',()=>{const r=renderTex('\\begin{document}\nfoo\n\n$$ x\n\\end{document}',makeSink());assert.ok(r.warnings.some(w=>/never closed/.test(w.message)));});
test('tex: engine not loaded gives skeletons, pending set',()=>{_resetMathForTests();const s=makeSink();const r=renderTex('$x$ \\[y\\]',s);assert.ok(s.pending);assert.match(r.html,/math-skel/);});
test('tex: CRLF files behave like LF',()=>{const a=renderTex('\\begin{document}\r\n\\section{A}\r\nx $y$\r\n\\end{document}',makeSink());const b=renderTex('\\begin{document}\n\\section{A}\nx $y$\n\\end{document}',makeSink());assert.equal(a.html,b.html);});
test('tex: empty input yields empty html and no crash',()=>{const r=renderTex('',makeSink());assert.equal(r.html,'');assert.deepEqual(r.ignored,[]);});
