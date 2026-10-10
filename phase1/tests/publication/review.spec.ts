import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const dir=process.env.SOMNIA_SHOTS??'/tmp/publication-shots';mkdirSync(dir,{recursive:true});
for(const theme of ['light','dark'])test(`review modal ${theme}: real tokens, manual confirm and hash-bound request`,async({page})=>{
 await page.goto(`/tests/publication/index.html?theme=${theme}&dirty&advanced`);
 await page.getByTestId('publication-panel').getByRole('button',{name:'Review publication',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByTestId('publication-unsaved')).toContainText('2 files');
 await expect(page.getByTestId('publication-publish')).toBeDisabled();
 await page.screenshot({animations:'disabled',path:`${dir}/review-${theme}.png`});
 await page.getByTestId('publication-metadata').locator('summary').click();
 await page.getByTestId('publication-confirm').check();
 await expect(page.getByTestId('publication-publish')).toBeEnabled();
 await page.getByTestId('publication-publish').click();
 await expect(page.getByTestId('publication-outcome')).toHaveText('Published: remote branch verified.');
 const calls=await page.evaluate(()=>(window as any).publicationCalls);expect(calls.filter((v:any)=>typeof v==='object')).toEqual([{planId:'plan-1',contentHash:'1a'.repeat(32),confirmed:true}]);
});
test('agent buffer blocker, fresh review after save, stale cannot auto-retry',async({page})=>{
 await page.goto('/tests/publication/index.html?agent&dirty&stale');
 await page.getByRole('button',{name:'Review publication',exact:true}).click();
 await page.getByTestId('publication-confirm').check();await expect(page.getByTestId('publication-publish')).toBeDisabled();
 await page.getByRole('button',{name:'Cancel'}).click();await page.getByTestId('test-dirty').click();
 await page.getByRole('button',{name:'Review publication',exact:true}).click();
 await page.getByTestId('publication-confirm').check();await page.getByTestId('publication-publish').click();
 await expect(page.getByTestId('publication-outcome')).toContainText('Review expired');
 await page.getByRole('button',{name:'Fetch and review again'}).click();await expect(page.getByTestId('publication-confirm')).not.toBeChecked();
});
for(const locale of ['de','es','fr','pt-BR'])test(`review ${locale}: all fields translated without overflow`,async({page})=>{
 await page.goto(`/tests/publication/index.html?locale=${locale}`);
 await page.getByTestId('publication-panel').getByRole('button').click();
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog')).not.toContainText('publication.');
 expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({animations:'disabled',path:`${dir}/review-${locale}.png`});
});
