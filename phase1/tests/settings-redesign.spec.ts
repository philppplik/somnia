import {test,expect} from './fixtures';
test('resizable settings shell, icons, live controls and settings-only undo',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Split view',exact:true})).toBeVisible();await page.keyboard.press('Control+,');const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();const bounds=await dialog.boundingBox();expect(bounds!.width).toBe(880);expect(bounds!.height).toBe(640);
 await expect(dialog.locator('nav button svg')).toHaveCount(10);
 await expect(dialog).toHaveCSS('resize','both');
 await dialog.getByLabel('Density',{exact:true}).selectOption('compact');await expect(page.locator('html')).toHaveCSS('--gap','3px');
 await dialog.getByLabel('Density',{exact:true}).focus();await page.keyboard.press('Control+z');await expect(page.locator('html')).toHaveCSS('--gap','6px');
 await dialog.getByRole('button',{name:'Code editor',exact:true}).click();await dialog.getByLabel('Format indentation').selectOption('4');
 await dialog.getByLabel('Format indentation').focus();await page.keyboard.press('Control+z');await expect(dialog.getByLabel('Format indentation')).toHaveValue('2');
 await dialog.getByRole('button',{name:'General',exact:true}).click();await dialog.getByLabel('Language').selectOption('de');
 await expect(dialog.getByRole('heading',{name:'Einstellungen',exact:true})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('lang','de');
 await dialog.getByLabel('Language').selectOption('en');await dialog.getByRole('button',{name:'Appearance',exact:true}).click();
 await page.screenshot({path:'tests/artifacts/settings-redesign-light.png'});
 await dialog.getByLabel('App theme').selectOption('dark');await page.screenshot({path:'tests/artifacts/settings-redesign-dark.png'});
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});
test('settings search groups matches from different sections and filters sidebar',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Split view',exact:true})).toBeVisible();await page.keyboard.press('Control+,');const dialog=page.getByRole('dialog');const search=dialog.getByLabel('Search settings');
 await search.fill('theme');await expect(dialog.getByLabel('App theme')).toBeVisible();await expect(dialog.getByLabel('Syntax theme')).toBeVisible();
 await expect(dialog.getByRole('button',{name:'General',exact:true})).toBeHidden();await expect(dialog.getByRole('button',{name:'Code editor',exact:true})).toBeVisible();
 await page.screenshot({path:'tests/artifacts/settings-redesign-search.png'});
 await search.fill('autocomplet');await expect(dialog.getByLabel('Autocomplete suggestions (tags, attributes, CSS properties)')).toBeVisible();
 await search.fill('zzzzzzzz');await expect(dialog.getByRole('status')).toHaveText('No matching settings.');
 await search.fill('');await dialog.getByRole('button',{name:'Canvas',exact:true}).click();await dialog.getByLabel('Canvas zoom').fill('150');
 await expect(dialog.getByLabel('Canvas zoom')).toHaveValue('150');await page.keyboard.press('Escape');await expect(page.getByLabel('Zoom',{exact:true})).toContainText('150');
});
test('settings fits smaller windows without losing close or controls',async({page})=>{
 await page.setViewportSize({width:760,height:560});await page.goto('/');await expect(page.getByRole('button',{name:'Split view',exact:true})).toBeVisible();await page.keyboard.press('Control+,');const dialog=page.getByRole('dialog');
 const b=await dialog.boundingBox();expect(b!.x).toBeGreaterThanOrEqual(0);expect(b!.y).toBeGreaterThanOrEqual(0);expect(b!.height).toBeLessThanOrEqual(528);
 await expect(dialog.getByRole('button',{name:'Close settings'})).toBeVisible();await dialog.getByLabel('Density',{exact:true}).selectOption('compact');
 await page.screenshot({path:'tests/artifacts/settings-redesign-small.png'});
});
