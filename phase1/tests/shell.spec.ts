import { test,expect } from '@playwright/test';
test('shell, palette, shortcuts, core edits, history and panels',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page.getByRole('main',{name:'Editor workspace'})).toBeVisible();
 await expect(page.frameLocator('iframe[title="Sandboxed design preview"]').locator('h1')).toBeVisible();
 await page.screenshot({path:'tests/artifacts/shell-dark.png',fullPage:true});
 await page.keyboard.press('Control+k');await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('combobox',{name:'Search commands'}).fill('split');await page.keyboard.press('Enter');
 await expect(page.getByRole('textbox',{name:'Source code'})).toBeVisible();
 const editor=page.getByRole('textbox',{name:'Source code'});const original=await editor.innerText();
 await editor.fill(original.replace('Your first idea starts here.','Core edit works.'));
 await expect(editor).toHaveText(/Core edit works/);await page.keyboard.press('Control+z');await expect(editor).toHaveText(original,{useInnerText:true});
 await page.keyboard.press('Control+Shift+z');await expect(editor).toHaveText(/Core edit works/);
 await page.getByRole('button',{name:'h1',exact:true}).click();
 await page.getByRole('textbox',{name:'Replacement text'}).fill('Changed from inspector');await page.getByRole('button',{name:'Apply text',exact:true}).click();
 await expect(editor).toHaveText(/Changed from inspector/);
 await page.getByRole('textbox',{name:'Element ID',exact:true}).fill('headline');await page.getByRole('textbox',{name:'Element ID',exact:true}).press('Enter');
 await expect(editor).toHaveText(/id="headline"/);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(editor).not.toHaveText(/id="headline"/);
 await page.getByRole('tab',{name:'Assets',exact:true}).click();await expect(page.getByText('Image importing is not connected yet.')).toBeVisible();
 await page.getByRole('tab',{name:'Layers',exact:true}).click();
 await page.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await expect(page.getByRole('complementary',{name:'Project sidebar'})).toHaveCount(0);
 await page.getByRole('button',{name:'Toggle sidebar',exact:true}).click();
 const separator=page.getByRole('separator',{name:'Resize sidebar'});await separator.focus();await page.keyboard.press('ArrowRight');await expect(separator).toHaveAttribute('aria-valuenow','268');
 await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('save');await expect(page.getByRole('option',{name:/Save project/})).toHaveAttribute('aria-disabled','true');
 await page.screenshot({path:'tests/artifacts/palette.png',fullPage:true});await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Design view',exact:true}).click();
 await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('Use light theme');await page.keyboard.press('Enter');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.screenshot({path:'tests/artifacts/shell-light.png',fullPage:true});
 expect(errors).toEqual([]);
});
test('input shortcuts preserve native editing and focus restores',async({page})=>{
 await page.goto('/');const filter=page.getByRole('textbox',{name:'Filter layers'});await filter.focus();await page.keyboard.press('Control+b');await expect(page.getByRole('complementary',{name:'Project sidebar'})).toBeVisible();
 await page.keyboard.press('Control+k');await expect(page.getByRole('combobox',{name:'Search commands'})).toBeFocused();await page.keyboard.press('Escape');await expect(filter).toBeFocused();
});
test('minimum desktop and light theme visual',async({page})=>{
 await page.goto('/');await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('Use light theme');await page.keyboard.press('Enter');await page.waitForTimeout(300);
 await page.screenshot({path:'tests/artifacts/light-rest.png'});
 await page.setViewportSize({width:960,height:600});await page.screenshot({path:'tests/artifacts/minimum.png'});
});
test('CodeMirror highlighted source stays in shared canvas history',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Split view',exact:true}).click();const editor=page.getByRole('textbox',{name:'Source code'});await expect(editor.locator('span').first()).toBeVisible();await editor.focus();await page.keyboard.press('Control+End');await page.keyboard.type('\n<!-- CodeMirror edit -->');await expect(editor).toHaveText(/CodeMirror edit/);await page.keyboard.press('Control+z');await expect(editor).not.toHaveText(/CodeMirror edit/);await page.keyboard.press('Control+Shift+z');await expect(editor).toHaveText(/CodeMirror edit/);await expect(page.frameLocator('iframe[title="Sandboxed design preview"]').locator('h1')).toHaveText('Make room for something new.');await page.screenshot({path:'tests/artifacts/codemirror-split.png'});
});

test('light is first-run default and explicit dark choice persists without saving project',async({page})=>{await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('Use dark theme');await page.keyboard.press('Enter');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.getByText('Unsaved changes',{exact:true})).toBeVisible();await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('Use light theme');await page.keyboard.press('Enter');await page.getByRole('button',{name:'Split view',exact:true}).click();await expect(page.getByLabel('Source code')).toBeVisible();await page.screenshot({path:'tests/artifacts/light-codemirror.png'});});
