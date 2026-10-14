import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:1000}});
test('documents proof: find panel accepts input through migrated controls',async({page})=>{
 await page.goto('/test/design-system/?view=documents');
 await expect(page.getByTestId('documents-proof')).toBeVisible();
 const find=page.getByTestId('documents-find-panel').getByRole('searchbox');
 await expect(find).toBeVisible();
 await find.fill('Proof');
 await expect(find).toHaveValue('Proof');
});
test('documents proof panels render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=documents');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('documents-find-panel').getByRole('searchbox')).toBeVisible();
  await page.screenshot({path:`test-results/ds-documents-${theme}.png`,fullPage:true});
 }
});
