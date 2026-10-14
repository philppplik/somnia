import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:1000}});
test('versions proof: subject input accepts text through migrated controls',async({page})=>{
 await page.goto('/test/design-system/?view=versions');
 await expect(page.getByTestId('versions-proof')).toBeVisible();
 const subject=page.getByTestId('versions-proof').getByRole('textbox').first();
 await expect(subject).toBeVisible();
 await subject.fill('Proof commit');
 await expect(subject).toHaveValue('Proof commit');
});
test('versions proof panels render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=versions');
  await page.evaluate(t2=>document.documentElement.setAttribute('data-theme',t2),theme);
  await expect(page.getByTestId('versions-proof')).toBeVisible();
  await page.screenshot({path:`test-results/ds-versions-${theme}.png`,fullPage:true});
 }
});
