import {test,expect} from '@playwright/test';
test('schema parameters validate, preserve typed values, omit optional fields and reset syntax errors',async({page})=>{
 await page.goto('/test/schema-form-preview.html');
 await page.getByRole('button',{name:'Continue'}).click();
 await expect(page.getByRole('alert')).toBeVisible();
 await page.getByLabel('Search commands *',{exact:true}).fill('banner.png');
 await page.getByLabel('Width (pixels) *',{exact:true}).fill('4.5');
 await page.getByRole('button',{name:'Continue'}).click();await expect(page.getByRole('alert')).toBeVisible();
 await page.getByLabel('Width (pixels) *',{exact:true}).fill('800');
 await page.getByLabel('Include Tags',{exact:true}).check();
 await page.getByLabel('Tags',{exact:true}).fill('[');
 await page.getByRole('button',{name:'Continue'}).click();await expect(page.getByRole('alert')).toBeVisible();
 await page.getByLabel('Include Tags',{exact:true}).uncheck();
 await page.getByRole('button',{name:'Continue'}).click();
 await expect(page.getByTestId('result')).toHaveText('{"size":800,"enabled":false,"options":{"format":"png"},"name":"banner.png"}');
});
test('review is immutable and exact arguments remain inspectable',async({page})=>{
 await page.goto('/test/schema-form-preview.html?review');
 await expect(page.getByLabel('Width (pixels) *',{exact:true})).toHaveAttribute('readonly','');
 await expect(page.getByLabel('Keep aspect ratio *',{exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Continue'})).toHaveCount(0);
 await page.getByText('Exact arguments (JSON)').click();await expect(page.locator('pre')).toContainText('"enabled": false');
});
