import {test,expect} from '@playwright/test';
test.skip(!process.env.SOMNIA_GIT_HARNESS,'Standalone component harness only');
for(const mode of ['light','dark'])test(`watcher refreshes Changes and Compare without writes (${mode})`,async({page})=>{
 await page.goto(`/tests/harness/git-invalidation/index.html?mode=${mode}`);
 await expect(page.getByTestId('versions-changes')).toBeVisible();
 await page.getByRole('combobox').selectOption('index.html');
 await expect(page.getByRole('region',{name:'Static preview viewport'})).toBeVisible();
 await page.evaluate(()=>(window as any).invalidate());
 await expect(page.getByTestId('versions-file')).toContainText('updated.html');
 await expect(page.getByRole('combobox').locator('option[value="updated.html"]')).toHaveCount(1);
 await expect(page.getByRole('combobox')).toHaveValue('');
 await page.getByRole('combobox').selectOption('updated.html');
 await expect(page.getByRole('region',{name:'Static preview viewport'})).toBeVisible();
 await expect(page.frameLocator('iframe[title^="After"]').getByRole('heading')).toHaveText('Refreshed');
 await page.getByRole('button',{name:'Only changes',exact:true}).click();
 await expect(page.getByRole('table',{name:'Changed source lines'})).toContainText('Refreshed');
 await page.screenshot({path:`/downloads/git-invalidation-${mode}.png`});
});
