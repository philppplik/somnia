import {test,expect} from '@playwright/test';
test('project search finds matches across files and replace all applies and undoes',async({page})=>{await page.goto('/');
 await page.keyboard.press('Control+Shift+F');
 await page.getByLabel('Search project').fill('Somnia');await expect(page.getByTestId('search-summary')).toHaveText(/\d+ match(es)? in [12] files?/);
 await page.getByLabel('Replace with').fill('Lumen');await page.getByRole('button',{name:'Replace all'}).click();await page.getByRole('group',{name:'Confirm replace'}).getByRole('button',{name:'Replace',exact:true}).click();
 await expect(page.getByTestId('search-summary')).toHaveText(/Type to search|0 matches/);
 await page.getByLabel('Search project').fill('Lumen');await expect(page.getByTestId('search-summary')).toHaveText(/\d+ match/);
 await page.keyboard.press('Control+z');await page.getByLabel('Search project').fill('Lumen ');await page.getByLabel('Search project').fill('Somnia');await expect(page.getByTestId('search-summary')).toHaveText(/\d+ match/);});
