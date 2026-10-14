import {test,expect} from '@playwright/test';
test('Local tab shows exact variants, advertised capability and remote provenance',async({page})=>{
 await page.goto('/test/local-models.html');
 await expect(page.getByText('qwen3:4b',{exact:true})).toBeVisible();
 await expect(page.getByText('Remote-backed',{exact:true})).toBeVisible();
 await expect(page.getByText('Vision',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();
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
 await page.goto('/test/local-models.html');await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
 await page.screenshot({path:'/tmp/local-models-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
 await expect(page.getByText('qwen3:4b',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:'/tmp/local-models-narrow.png',fullPage:true});
});
