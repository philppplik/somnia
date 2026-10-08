import {test,expect} from './fixtures';
const shotDir=process.env.SOMNIA_SHOTS;
test('settings: modified view, badges, single and bulk reset',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Split view',exact:true})).toBeVisible();await page.keyboard.press('Control+,');
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Modified',exact:true}).click();
 await expect(dialog.getByText('Nothing changed')).toBeVisible();
 await dialog.getByRole('button',{name:'Code editor',exact:true}).click();
 await dialog.getByRole('checkbox',{name:/Emmet/}).uncheck();
 await dialog.getByRole('button',{name:/^Editing/}).click();
 await dialog.getByLabel('Units and paper').selectOption('imperial');
 await expect(dialog.getByRole('button',{name:/^Modified/})).toContainText('2');
 await expect(dialog.getByRole('button',{name:/^Editing/})).toContainText('1');
 await dialog.getByRole('button',{name:/^Modified/}).click();
 await expect(dialog.getByTestId('settings-modified').locator('li')).toHaveCount(2);
 await expect(dialog.getByTestId('modified-workflow.units')).toContainText('Default: auto → imperial');
 if(shotDir)await dialog.screenshot({path:`${shotDir}/settings-modified-1.png`});
 await dialog.getByTestId('modified-workflow.units').getByRole('button',{name:'Reset',exact:true}).click();
 await expect(dialog.getByTestId('settings-modified').locator('li')).toHaveCount(1);
 await dialog.getByTestId('settings-reset-all').click();
 await expect(dialog.getByText('Nothing changed')).toBeVisible();
 await expect(page.getByRole('dialog').getByRole('button',{name:/^Modified/})).not.toContainText('1');
});

test('settings search: synonyms, @filters and commands in one list',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Split view',exact:true})).toBeVisible();await page.keyboard.press('Control+,');
 const dialog=page.getByRole('dialog');const search=dialog.getByPlaceholder('Search settings…');
 await search.fill('inches');
 await expect(dialog.getByTestId('result-workflow.units')).toBeVisible();
 await search.fill('@project');
 await expect(dialog.getByTestId('settings-results').locator('li')).toHaveCount(4);
 await search.fill('@modified');
 await expect(dialog.getByRole('status')).toHaveText('No matching settings.');
 await search.fill('export');
 await expect(dialog.getByTestId('result-cmd-project.export')).toBeVisible();
 if(shotDir)await dialog.screenshot({path:`${shotDir}/settings-search-1.png`});
 await search.fill('inches');await dialog.getByTestId('result-workflow.units').getByRole('button').first().click();
 await expect(dialog.getByLabel('Units and paper')).toBeVisible();
});
