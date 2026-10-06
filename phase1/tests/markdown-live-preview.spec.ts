import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
const addText=(page:Page,name:string,text:string)=>page.evaluate(async([n,t]:string[])=>{const m=await import('/src/lib/projectActions.ts');m.addTextFiles([{name:n,text:t}]);},[name,text]);
const long=Array.from({length:60},(_,i)=>`## Section ${i+1}\n\nParagraph ${i+1} with some text that is long enough to wrap in a narrow pane. `.repeat(1)+'Lorem ipsum dolor sit amet, consectetur adipiscing elit.\n\n- item a\n- item b\n  - nested\n').join('\n');
async function open(page:Page,text:string,name='doc.md'){await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();await addText(page,name,text);await page.getByRole('button',{name:'Split',exact:true}).waitFor();}
async function split(page:Page){await page.keyboard.press('Control+3');await expect(page.locator('.cm-content')).toBeVisible();await expect(page.getByTestId('md-pane')).toBeVisible();}
const src=(page:Page)=>page.locator('.cm-content');
const setDoc=(page:Page,text:string)=>page.evaluate(async t=>{const m=await import('/src/lib/mdBridge.ts');const v=m.getMdSource()!;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:t}});},text);
const docText=(page:Page)=>page.evaluate(async()=>(await import('/src/lib/mdBridge.ts')).getMdSource()!.state.doc.toString());
test('markdown gets Source / Split / Preview, syntax highlighting and live preview',async({page})=>{
 await open(page,'# Hello\n\nSome **bold** text\n');
 await expect(page.getByRole('button',{name:'Split',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Preview',exact:true}).first()).toBeVisible();await expect(page.getByRole('button',{name:'Source',exact:true})).toBeVisible();
 await split(page);
 await expect(page.getByTestId('md-toolbar')).toBeVisible();await expect(page.getByTestId('md-preview').getByRole('heading',{name:'Hello'})).toBeVisible();
 await expect(page.locator('.cm-content .tok-heading, .cm-content [class*="ͼ"]').first()).toBeVisible();
 await src(page).click();await page.keyboard.press('Control+End');await page.keyboard.type('\n## Typed live\n');
 await expect(page.getByTestId('md-preview').getByRole('heading',{name:'Typed live'})).toBeVisible();
 expect(await docText(page)).toContain('## Typed live');
 await page.screenshot({path:'test-results/markdown-split-light.png'});
});
test('view shortcuts work from the Markdown editor; Mod+B is Bold there and sidebar elsewhere',async({page})=>{
 await open(page,'word\n');await split(page);await src(page).click();
 await page.keyboard.press('Control+1');await expect(page.getByTestId('md-pane')).toHaveCount(0);
 await page.keyboard.press('Control+2');await expect(page.getByTestId('md-pane')).toBeVisible();await expect(page.getByTestId('md-toolbar')).toHaveCount(0);
 await page.keyboard.press('Control+3');await src(page).click();await page.keyboard.press('Control+a');
 const sidebar=await page.evaluate(async()=>(await import('/src/store/appStore.ts')).getState().sidebarOpen);
 await page.keyboard.press('Control+b');expect(await docText(page)).toBe('**word**\n');
 expect(await page.evaluate(async()=>(await import('/src/store/appStore.ts')).getState().sidebarOpen)).toBe(sidebar);
 await page.keyboard.press('Control+i');expect((await docText(page))).toContain('***word***');
 await page.keyboard.press('Control+z');expect(await docText(page)).toBe('**word**\n');
});
test('toolbar formats with one undo step, keeps selection and does not steal focus',async({page})=>{
 await open(page,'alpha\nbeta\n');await split(page);await src(page).click();await page.keyboard.press('Control+a');
 await page.getByTestId('md-bullet').click();expect(await docText(page)).toBe('- alpha\n- beta\n');
 await expect(src(page)).toBeFocused();
 await page.keyboard.press('Control+z');expect(await docText(page)).toBe('alpha\nbeta\n');
 await page.getByTestId('md-task').click();expect(await docText(page)).toBe('- [ ] alpha\n- [ ] beta\n');
 await expect(page.getByTestId('md-preview').locator('input[type=checkbox][disabled]')).toHaveCount(2);
 await page.getByTestId('md-more').click();await page.getByTestId('md-more-h2').click();expect(await docText(page)).toContain('## ');
});
test('link dialog inserts only on confirm and Escape cancels unchanged',async({page})=>{
 await open(page,'see docs now\n');await split(page);await src(page).click();
 await page.evaluate(async()=>{const v=(await import('/src/lib/mdBridge.ts')).getMdSource()!;v.dispatch({selection:{anchor:4,head:8}});});
 await page.getByTestId('md-link').click();await expect(page.getByTestId('md-link-text')).toHaveValue('docs');
 await page.keyboard.press('Escape');expect(await docText(page)).toBe('see docs now\n');
 await page.getByTestId('md-link').click();await page.getByTestId('md-link-url').fill('https://example.com/a');await page.getByTestId('md-link-insert').click();
 expect(await docText(page)).toBe('see [docs](https://example.com/a) now\n');
});
test('Enter continues lists, Shift+Enter is plain newline',async({page})=>{
 await open(page,'- one');await split(page);await src(page).click();await page.keyboard.press('Control+End');await page.keyboard.press('Enter');await page.keyboard.type('two');
 expect(await docText(page)).toBe('- one\n- two');await page.keyboard.press('Shift+Enter');await page.keyboard.type('x');expect(await docText(page)).toBe('- one\n- two\nx');
 await page.keyboard.press('Control+a');await page.keyboard.type('- a\nb\n');await page.keyboard.press('Enter');expect(await docText(page)).toBe('- a\n- b\n');
});
test('preview is read-only, tasks stay disabled, scripts and unsafe links are inert',async({page})=>{
 await open(page,'- [x] done\n\n<script>window.__xss=1</script>\n\n[bad](javascript:window.__xss=2) ![r](https://evil.test/x.png)\n');await split(page);
 const md=page.getByTestId('md-preview');await expect(md.locator('input[type=checkbox]')).toBeDisabled();await expect(md.locator('script,img')).toHaveCount(0);await expect(md.locator('a[href^="javascript"]')).toHaveCount(0);
 await md.locator('input[type=checkbox]').click({force:true});expect(await docText(page)).toContain('- [x] done');
 expect(await page.evaluate(()=>(window as any).__xss)).toBeUndefined();
 expect(await md.evaluate(e=>e.getAttribute('contenteditable'))).toBeNull();
});
test('reveal in source from the preview context menu',async({page})=>{
 await open(page,'# One\n\nSecond paragraph\n\n# Three\n');await split(page);
 await page.getByTestId('md-preview').getByText('Second paragraph').click({button:'right'});await page.getByTestId('md-reveal').click();
 const sel=await page.evaluate(async()=>{const v=(await import('/src/lib/mdBridge.ts')).getMdSource()!;const r=v.state.selection.main;return v.state.sliceDoc(r.from,r.to);});
 expect(sel).toBe('Second paragraph');await expect(src(page)).toBeFocused();
});
test('scroll sync follows the pane being scrolled in both directions without moving the caret',async({page})=>{
 await open(page,long);await split(page);await expect(page.getByTestId('md-preview').locator('h2').first()).toBeVisible();
 await expect(page.getByTestId('md-sync')).toHaveAttribute('aria-pressed','true');
 await src(page).click();const caret=await page.evaluate(async()=>(await import('/src/lib/mdBridge.ts')).getMdSource()!.state.selection.main.head);
 const scroller=page.locator('.cm-scroller');const pane=page.getByTestId('md-scroll');
 await scroller.hover();await page.mouse.wheel(0,1500);
 await expect.poll(()=>pane.evaluate(e=>e.scrollTop)).toBeGreaterThan(300);
 const before=await page.evaluate(async()=>(await import('/src/lib/mdBridge.ts')).getMdSource()!.scrollDOM.scrollTop);
 await pane.hover();await page.mouse.wheel(0,-1200);
 await expect.poll(()=>page.evaluate(async()=>(await import('/src/lib/mdBridge.ts')).getMdSource()!.scrollDOM.scrollTop)).toBeLessThan(before-200);
 expect(await page.evaluate(async()=>(await import('/src/lib/mdBridge.ts')).getMdSource()!.state.selection.main.head)).toBe(caret);
 await page.getByTestId('md-sync').click();await expect(page.getByTestId('md-sync')).toHaveAttribute('aria-pressed','false');
 const p0=await pane.evaluate(e=>e.scrollTop);await scroller.hover();await page.mouse.wheel(0,800);await page.waitForTimeout(250);expect(await pane.evaluate(e=>e.scrollTop)).toBe(p0);
 await page.getByTestId('md-sync').click();
 await scroller.hover();await page.mouse.wheel(0,200000);
 await expect.poll(()=>pane.evaluate(e=>Math.abs(e.scrollHeight-e.clientHeight-e.scrollTop))).toBeLessThan(3);
});
test('typing does not scroll the preview and edits above keep the reading position',async({page})=>{
 await open(page,long);await split(page);const pane=page.getByTestId('md-scroll');
 await page.locator('.cm-scroller').hover();await page.mouse.wheel(0,1500);await expect.poll(()=>pane.evaluate(e=>e.scrollTop)).toBeGreaterThan(300);
 const top=await pane.evaluate(e=>e.scrollTop);await setDoc(page,'# New first line\n\n'+(await docText(page)));
 await expect(page.getByTestId('md-preview').getByRole('heading',{name:'New first line'})).toBeVisible();
 expect(await pane.evaluate(e=>e.scrollTop)).toBeGreaterThan(top-50);
});
test('relative md links open project tabs, fragments scroll, missing files report a neutral error',async({page})=>{
 await open(page,'[other](other.md#target) [gone](missing.md) [top](#intro)\n\n# Intro\n','index.md');await addText(page,'other.md','# Other\n\n'+'filler\n\n'.repeat(80)+'## Target\n\nend\n');
 await page.getByRole('tab',{name:/index\.md/}).click();await page.keyboard.press('Control+2');
 const md=page.getByTestId('md-preview');await md.getByRole('link',{name:'gone'}).click();await expect(page.getByRole('status').filter({hasText:'missing.md'})).toBeVisible();
 await md.getByRole('link',{name:'other'}).click();await expect(md.getByRole('heading',{name:'Other'})).toBeVisible();
 await expect.poll(()=>page.getByTestId('md-scroll').evaluate(e=>e.scrollTop)).toBeGreaterThan(200);
});
test('no remote image requests are made',async({page})=>{
 const reqs:string[]=[];page.on('request',r=>{if(/evil\.test/.test(r.url()))reqs.push(r.url());});
 await open(page,'![x](https://evil.test/p.png)\n');await split(page);await expect(page.getByTestId('md-preview').locator('.md-missing-image')).toBeVisible();expect(reqs).toEqual([]);
 await page.getByRole('button',{name:'Layers'}).first().click().catch(()=>{});
});
test('dark theme and screenshots',async({page})=>{
 await open(page,'# Dark\n\n```js\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> quote\n');await split(page);
 await page.evaluate(async()=>{(await import('/src/store/appStore.ts')).patchState({themeChoice:'dark',theme:'dark'});});
 await expect(page.getByTestId('md-preview').locator('table')).toBeVisible();await page.screenshot({path:'test-results/markdown-split-dark.png'});
 await page.keyboard.press('Control+2');await page.screenshot({path:'test-results/markdown-preview-dark.png'});
});
