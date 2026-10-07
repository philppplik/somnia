import {test,expect} from './fixtures';
const addText=(page:any,name:string,text:string)=>page.evaluate(async([n,t]:string[])=>{const m=await import('/src/lib/projectActions.ts');m.addTextFiles([{name:n,text:t}]);},[name,text]);
const openProblems=async(page:any)=>{await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');void m.executeCommand('problems.toggle');});};
const MD='# Math\n\nInline $x^2 + y^2 = z^2$ and \\(a_1\\). Prices: "5 $ und 7 $", $5 or $10, costs \\$3.\n\nCode `$not$` stays.\n\n$$\\int_0^1 x\\,dx = \\frac12$$\n\n\\[ E = mc^2 \\]\n\n```\n$fenced$\n```\n';
test('markdown math renders, prices and code stay text, KaTeX loads lazily',async({page})=>{
 const katexReq:string[]=[];page.on('request',(r:any)=>{if(/katex/i.test(r.url()))katexReq.push(r.url());});
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await addText(page,'plain.md','# No math here\n\nJust 5 $ and 7 $.');
 await expect(page.getByTestId('md-preview').getByRole('heading',{name:'No math here'})).toBeVisible();
 expect(katexReq).toEqual([]);
 await addText(page,'math.md',MD);
 const md=page.getByTestId('md-preview');
 await expect(md.locator('.math-inline .katex')).toHaveCount(2);await expect(md.locator('.math-block .katex')).toHaveCount(2);
 await expect(md.locator('.math-inline').first()).toHaveAttribute('aria-label','x^2 + y^2 = z^2');
 await expect(md).toContainText('5 $ und 7 $');await expect(md).toContainText('$5 or $10');await expect(md).toContainText('costs $3');
 await expect(md.locator('code',{hasText:'$not$'})).toBeVisible();await expect(md.locator('pre code')).toContainText('$fenced$');
 await expect(page.getByTestId('math-pill-ok')).toBeVisible();await expect(page.getByTestId('math-pill-ok')).toContainText('0');
 expect(katexReq.length).toBeGreaterThan(0);
 await page.screenshot({path:'test-results/math-markdown.png'});});
test('formula errors are isolated, listed in Problems and shown in the status bar',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await addText(page,'bad.md','First $x^2$ fine.\n\nBroken $\\frac{1}{$ inline and $\\href{javascript:alert(1)}{click}$ blocked.\n\n$$\\unknowncmd{x}$$\n\nLast $y$ fine.\n');
 const md=page.getByTestId('md-preview');
 await expect(md.locator('.math-inline .katex')).toHaveCount(2);await expect(md.locator('.math-error')).toHaveCount(2);await expect(md.locator('.math-error-block')).toHaveCount(1);
 await expect(md.locator('a[href^="javascript"]')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__xss)).toBeUndefined();
 await expect(page.getByTestId('math-pill-errors')).toContainText('3');
 await openProblems(page);
 const panel=page.getByTestId('problems-panel');await expect(panel).toContainText('Math:');await expect(panel).toContainText('disabled in Somnia (security)');await expect(panel.locator('li')).toHaveCount(3);
 await panel.locator('li button').first().click();
 await page.screenshot({path:'test-results/math-errors.png'});});
test('unclosed $$ only warns and keeps the rest of the page',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await addText(page,'open.md','Intro\n\n$$ a = b\n\nAfter $x$ is still math.\n');
 await expect(page.getByTestId('md-preview').locator('.math-inline .katex')).toHaveCount(1);await expect(page.getByTestId('md-preview')).toContainText('$$ a = b');
 await openProblems(page);await expect(page.getByTestId('problems-panel')).toContainText('never closed');});
test('the Settings switch turns math rendering off',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.evaluate(async()=>{const m=await import('/src/store/appStore.ts');const st=m.getState();m.patchState({editorPrefs:{...st.editorPrefs,mathMarkdown:false}});});
 await addText(page,'off.md','Text $x^2$ stays.');
 await expect(page.getByTestId('md-preview')).toContainText('$x^2$');await expect(page.getByTestId('md-preview').locator('.katex')).toHaveCount(0);});
test('tex file: highlighting, math preview with notice bar and skipped list',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.evaluate(async()=>{const m=await import('/src/store/appStore.ts');m.patchState({viewMode:'split'});});
 await addText(page,'paper.tex','\\documentclass{article}\n\\usepackage{amsmath}\n% a comment\n\\begin{document}\n\\section{Intro}\nWe show \\textbf{this}: $a^2+b^2=c^2$.\n\\begin{itemize}\n\\item one\n\\item two\n\\end{itemize}\n\\begin{equation}\n\\sum_{i=1}^n i = \\frac{n(n+1)}{2}\n\\end{equation}\n\\cite{knuth}\n\\end{document}\n');
 const tex=page.getByTestId('tex-preview');
 await expect(tex.getByRole('heading',{name:'1 Intro'})).toBeVisible();await expect(tex.locator('.katex')).toHaveCount(2);await expect(tex.locator('li')).toHaveCount(2);await expect(tex.locator('.tex-eqno')).toHaveText('(1)');
 await expect(page.getByTestId('tex-banner')).toContainText('no PDF compile');
 await expect(page.getByTestId('tex-ignored')).toContainText('\\usepackage{amsmath}');await expect(page.getByTestId('tex-ignored')).toContainText('\\cite');
 await expect(page.getByTestId('math-pill-tex')).toBeVisible();
 await expect(page.locator('.cm-content .cm-line').first()).toContainText('documentclass');
 expect(await page.locator('.cm-content span[class*="ͼ"]').count()).toBeGreaterThan(3);
 await page.screenshot({path:'test-results/math-tex.png'});
 await page.getByTestId('tex-banner').getByRole('button').click();await expect(page.getByTestId('tex-banner')).toHaveCount(0);});
test('engine load failure: formulas stay as source, Problems entry, retry button does not crash',async({page})=>{
 let block=true;await page.route(/katex/i,(r:any)=>block?r.abort():r.continue());
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await addText(page,'x.md','Formula $x^2$ here.\n');
 await expect(page.getByTestId('math-pill-failed')).toBeVisible();await expect(page.getByTestId('md-preview')).toContainText('$x^2$');
 await openProblems(page);await expect(page.getByTestId('problems-panel')).toContainText('math engine could not be loaded');
 await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByTestId('math-pill-failed')).toBeVisible();await expect(page.getByTestId('md-preview')).toContainText('$x^2$');await page.screenshot({path:'test-results/math-load-failed.png'});});
test('loading placeholder shows skeletons then the formulas',async({page})=>{
 await page.route(/katex/i,async(r:any)=>{await new Promise(res=>setTimeout(res,1200));await r.continue();});
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await addText(page,'slow.md','Slow $x^2$ and\n\n$$y^3$$\n');
 await expect(page.getByTestId('md-preview').locator('.math-skel')).toHaveCount(1);await expect(page.getByTestId('md-preview').locator('.math-skel-block')).toHaveCount(1);
 await expect(page.getByText(/math engine loads once/i)).toBeVisible();await page.screenshot({path:'test-results/math-loading.png'});
 await expect(page.getByTestId('md-preview').locator('.katex')).toHaveCount(2);await expect(page.locator('.math-skel')).toHaveCount(0);});
