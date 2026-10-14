import {test,expect} from '@playwright/test';
test('Local tab shows exact variants, advertised capability and remote provenance',async({page})=>{
 await page.goto('/test/local-models.html');
 await expect(page.getByText('qwen3:4b',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('Remote-backed',{exact:true})).toBeVisible();
 await expect(page.getByText('Vision',{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Refresh',exact:true}).first()).toBeEnabled();
});
test('shared five-tab keyboard navigates every tab and wraps',async({page})=>{
 await page.goto('/test/local-models.html');const tabs=page.getByRole('tab');
 await tabs.nth(0).focus();
 for(const index of [1,2,3,4,0]){await page.keyboard.press('ArrowRight');await expect(tabs.nth(index)).toBeFocused();await expect(tabs.nth(index)).toHaveAttribute('aria-selected','true');}
 await page.keyboard.press('End');await expect(tabs.nth(4)).toBeFocused();
 await page.keyboard.press('Home');await expect(tabs.nth(0)).toBeFocused();
 await page.keyboard.press('ArrowLeft');await expect(tabs.nth(4)).toBeFocused();
});
test('empty inventory and malformed inventory have different states',async({page})=>{
 await page.goto('/test/local-models.html?state=empty');await expect(page.getByText('No models installed.',{exact:true})).toBeVisible();
 await page.goto('/test/local-models.html?state=malformed');await expect(page.getByRole('alert')).toContainText('Could not read model inventory');
});
test('local model fixture stays readable at narrow widths and dark theme',async({page})=>{
 await page.goto('/test/local-models.html');await expect(page.getByRole('button',{name:'Refresh',exact:true}).first()).toBeEnabled();
 await expect(page.getByText('Fixture GPU:',{exact:false})).toBeVisible();
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
 await page.screenshot({path:'/tmp/local-models-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
 await expect(page.getByText('qwen3:4b',{exact:true}).first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:'/tmp/local-models-narrow.png',fullPage:true});
});
test('model download and removal require review and reconcile their results',async({page})=>{
 await page.goto('/test/local-models.html?state=actions');
 await page.getByRole('textbox',{name:'Exact model variant'}).fill('qwen3:4b');
 await page.getByRole('button',{name:'Download by name',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('License, download size and free storage are not checked');
 await expect(page.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Complete: inventory and local verification confirmed');
 await page.getByRole('button',{name:'Remove qwen3:4b',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Shared blobs');
 await page.waitForTimeout(250);
 await page.screenshot({path:'/tmp/local-model-delete-review.png',fullPage:true});
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await expect(page.getByRole('button',{name:'Remove qwen3:4b',exact:true})).toHaveCount(0);
});
test('cancelled owned transfer never claims daemon cancellation certainty',async({page})=>{
 await page.goto('/test/local-models.html?state=actions-slow');
 await page.getByRole('textbox',{name:'Exact model variant'}).fill('qwen3:4b');await page.getByRole('button',{name:'Download by name',exact:true}).click();
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await page.getByRole('status').getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Daemon cancellation is unknown');
 await page.screenshot({path:'/tmp/local-model-cancel-unknown.png',fullPage:true});
});
test('hardware fit remains an estimate and daemon residency reports actual size_vram',async({page})=>{
 await page.goto('/test/local-models.html');
 await expect(page.getByText('Fixture GPU:',{exact:false})).toBeVisible();
 await expect(page.getByText('Loaded: daemon reports 2 GiB in VRAM',{exact:false})).toBeVisible();
 await expect(page.getByText('Model storage volume/free space: not checked',{exact:true})).toBeVisible();
 await expect(page.getByText('Image input adapter not enabled',{exact:false})).toBeVisible();
});
test('advanced runtime options expose requested values and daemon-default limits',async({page})=>{
 await page.goto('/test/local-models.html?state=advanced');await page.getByText('Advanced runtime settings',{exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'Requested context tokens (blank: daemon default)'})).toHaveValue('16384');
 await expect(page.getByText('Draft until Save.',{exact:false})).toBeVisible();
 await page.screenshot({path:'/tmp/local-runtime-advanced.png',fullPage:true});
});
test('alternate runtimes are inspect-only with no inferred local execution',async({page})=>{
 await page.goto('/test/local-models.html');await page.getByText('Other local runtimes: inspect only',{exact:true}).click();
 await expect(page.getByText('Metadata only. Loopback is not proof of local inference.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Inspect metadata',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('requires desktop');
 await page.screenshot({path:'/tmp/local-runtime-discovery.png',fullPage:true});
});
