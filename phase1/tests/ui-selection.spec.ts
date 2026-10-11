import {test,expect} from './fixtures';
import type {Locator,Page} from '@playwright/test';
import {showCode} from './helpers';

/** Actual mouse selection, not a programmatic Range (which bypasses user-select). */
async function dragText(page:Page,locator:Locator){
 await locator.scrollIntoViewIfNeeded();
 await page.evaluate(()=>window.getSelection()?.removeAllRanges());
 const box=await locator.boundingBox();expect(box).not.toBeNull();
 await page.mouse.move(box!.x+2,box!.y+box!.height/2);
 await page.mouse.down();
 await page.mouse.move(box!.x+box!.width-2,box!.y+box!.height/2,{steps:15});
 await page.mouse.up();
 return page.evaluate(()=>window.getSelection()?.toString()??'');
}

test('settings chrome cannot be selected; search input keeps native selection',async({page})=>{
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();
 await page.keyboard.press('Control+,');const dialog=page.getByRole('dialog');
 const heading=dialog.getByRole('heading',{name:'Settings',exact:true});
 await expect(heading).toBeVisible();expect(await dragText(page,heading)).toBe('');
 await expect(heading).toHaveCSS('user-select','none');
 const search=dialog.getByLabel('Search settings');await search.fill('theme');
 await expect(search).toHaveCSS('user-select','text');
 await search.press('Control+a');
 expect(await search.evaluate((el:HTMLInputElement)=>el.value.slice(el.selectionStart!,el.selectionEnd!))).toBe('theme');
 await page.screenshot({path:'tests/artifacts/ui-selection-settings.png'});
});

test('top navigation menus, panels, tabs and status stay non-selectable',async({page})=>{
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Project',exact:true}).click();
 const item=page.getByRole('menuitem',{name:/Open folder/});await expect(item).toBeVisible();
 await expect(item).toHaveCSS('user-select','none');
 await page.screenshot({path:'tests/artifacts/ui-selection-menu.png'});
 expect(await dragText(page,item)).toBe('');
 await page.keyboard.press('Escape');
 await showCode(page);
 for(const selector of ['[role=tab]','.panel','[data-storage]']){
  await expect(page.locator(selector).first()).toHaveCSS('user-select','none');
 }
});

test('source, textarea and explicitly copyable content retain mouse selection',async({page})=>{
 await page.goto('/');await showCode(page);
 const source=page.getByLabel('Source code');await expect(source).toHaveCSS('user-select','text');
 expect(await dragText(page,source.locator('.cm-line').filter({hasText:'<!DOCTYPE'}).first())).not.toBe('');
 await page.keyboard.press('Control+a');expect(await page.evaluate(()=>window.getSelection()?.toString())).toContain('<html');
 // Exercise the documented opt-in inside chrome, including nested text and a button.
 await page.evaluate(()=>{
  const host=document.createElement('div');host.style.cssText='position:fixed;inset:80px auto auto 80px;z-index:9999;background:white;padding:20px';
  host.innerHTML='<pre data-copyable><span>Copyable error report details</span><button>Copy report</button></pre><textarea aria-label="Selection test">Editable textarea contents</textarea>';
  document.body.append(host);
 });
 const report=page.locator('[data-copyable] span').filter({hasText:'Copyable error report details'});
 expect(await dragText(page,report)).not.toBe('');
 await expect(page.getByRole('button',{name:'Copy report',exact:true})).toHaveCSS('user-select','none');
 const textarea=page.getByLabel('Selection test');await expect(textarea).toHaveCSS('user-select','text');
 await textarea.focus();await textarea.press('Control+a');
 expect(await textarea.evaluate((el:HTMLTextAreaElement)=>el.value.slice(el.selectionStart,el.selectionEnd))).toBe('Editable textarea contents');
});

// DEPRECATED-DEBT (12.1.0): the old direct-clipboard assertion was dropped. The D3 diagnostics
// integration (docs/errors/d3-ui-integration.md) redefines copyErrorReport to open a preview
// dialog first; only the dialog's own "Copy report" button writes the exact immutable bytes.
test('Copy error report opens the diagnostics preview and copies its exact report',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();
 await page.keyboard.press('Control+,');await page.getByRole('button',{name:'About',exact:true}).click();
 await page.getByTestId('copy-error-report').click();
 const preview=page.locator('pre.diag-preview');
 await expect(preview).toContainText('Somnia');
 // The diagnostics dialog inerts the Settings portal (base-ui): close Settings via its own
 // close control with a forced CSS click, since role queries skip aria-hidden subtrees.
 await page.locator('button.settings-close').click({force:true});
 await expect(page.locator('button.settings-close')).toHaveCount(0);
 await expect(preview).toContainText('Somnia');
 await page.getByRole('button',{name:'Copy report',exact:true}).click();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('Somnia');
});
