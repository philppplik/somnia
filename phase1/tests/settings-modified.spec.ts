import {test,expect} from './fixtures';
import fs from 'node:fs';
const shotDir=process.env.SOMNIA_SHOTS;
test('settings: modified view, badges, single and bulk reset',async({page})=>{
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();await page.keyboard.press('Control+,');
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
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();await page.keyboard.press('Control+,');
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

test('settings export and import roundtrip',async({page})=>{
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();await page.keyboard.press('Control+,');
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:/^Editing/}).click();await dialog.getByLabel('Units and paper').selectOption('imperial');
 await dialog.getByRole('button',{name:/^Modified/}).click();
 const dl=page.waitForEvent('download');await dialog.getByTestId('settings-export').click();
 const file=await (await dl).path();const text=fs.readFileSync(file!,'utf8');
 expect(JSON.parse(text).settings).toEqual({'workflow.units':'imperial'});
 await dialog.getByTestId('settings-reset-all').click();await expect(dialog.getByText('Nothing changed')).toBeVisible();
 await dialog.getByTestId('settings-import-file').setInputFiles({name:'s.json',mimeType:'application/json',buffer:Buffer.from(text)});
 await expect(dialog.getByTestId('modified-workflow.units')).toBeVisible();
 await dialog.getByTestId('settings-import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('nope')});
 await expect(dialog.getByRole('status')).toContainText('Not a valid JSON file');
});

test('setup export and reviewed import roundtrip',async({page})=>{
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();await page.keyboard.press('Control+,');
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:/^Editing/}).click();await dialog.getByLabel('Units and paper').selectOption('imperial');
 await dialog.getByRole('button',{name:/^Modified/}).click();
 const dl=page.waitForEvent('download');await dialog.getByTestId('setup-export').click();
 const download=await dl;expect(download.suggestedFilename()).toMatch(/\.somnia-settings\.json$/);
 const text=fs.readFileSync((await download.path())!,'utf8');
 const doc=JSON.parse(text);
 expect(doc).toMatchObject({app:'somnia',kind:'setup',schemaVersion:1,scope:'user'});
 expect(doc.categories.settings.values).toEqual({'workflow.units':'imperial'});
 expect(doc.categories.keybindings).toBeUndefined();
 await dialog.getByTestId('settings-reset-all').click();await expect(dialog.getByText('Nothing changed')).toBeVisible();
 // importing opens a review; nothing is applied until Apply
 await dialog.getByTestId('setup-import-file').setInputFiles({name:'s.somnia-settings.json',mimeType:'application/json',buffer:Buffer.from(text)});
 await expect(dialog.getByTestId('setup-review')).toBeVisible();
 await expect(dialog.getByTestId('row-setting:workflow.units')).toHaveAttribute('data-status','add');
 await expect(dialog.getByTestId('modified-workflow.units')).toHaveCount(0);
 if(shotDir)await dialog.screenshot({path:`${shotDir}/settings-setup-review.png`});
 await dialog.getByTestId('setup-apply').click();
 await expect(dialog.getByTestId('setup-note')).toContainText('Applied 1 changes');
 await expect(dialog.getByTestId('modified-workflow.units')).toBeVisible();
 // the sync folder stays paused after an import until it is resumed explicitly
 await expect(dialog.getByTestId('setup-sync-note')).toBeVisible();
 await dialog.getByTestId('setup-sync-resume').click();
 await expect(dialog.getByTestId('setup-sync-note')).toHaveCount(0);
 // undo restores the state from before the import
 await dialog.getByTestId('setup-undo').click();
 await expect(dialog.getByTestId('setup-note')).toContainText('Restored the setup from before the last import');
 await expect(dialog.getByText('Nothing changed')).toBeVisible();
 await dialog.getByTestId('setup-import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('nope')});
 await expect(dialog.getByTestId('setup-note')).toContainText('not valid JSON');
 await expect(dialog.getByTestId('setup-review')).toHaveCount(0);
});

test('legacy settings file opens as a merge preview and never resets other values',async({page})=>{
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();await page.keyboard.press('Control+,');
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:/^Editing/}).click();await dialog.getByLabel('Units and paper').selectOption('metric');
 await dialog.getByRole('button',{name:/^Modified/}).click();
 const legacy=JSON.stringify({app:'somnia',kind:'settings',version:1,settings:{'editor.lint':false}});
 await dialog.getByTestId('setup-import-file').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(legacy)});
 await expect(dialog.getByTestId('setup-review')).toBeVisible();
 await expect(dialog.getByTestId('setup-review')).toContainText('Older file format');
 await expect(dialog.getByTestId('mode-select')).toHaveValue('merge');
 await expect(dialog.getByTestId('row-setting:editor.lint')).toHaveAttribute('data-status','add');
 await expect(dialog.getByTestId('row-setting:workflow.units')).toHaveCount(0);
 await dialog.getByTestId('setup-cancel').click();
 await expect(dialog.getByTestId('setup-review')).toHaveCount(0);
 await expect(dialog.getByTestId('modified-workflow.units')).toBeVisible();
 await expect(dialog.getByTestId('modified-editor.lint')).toHaveCount(0);
});

test('setup import flags a shortcut that collides with a built-in default and skips it unless chosen',async({page})=>{
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();await page.keyboard.press('Control+,');
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:/^Modified/}).click();
 const file=JSON.stringify({app:'somnia',kind:'setup',schemaVersion:1,scope:'user',categories:{keybindings:{common:{'project.export':'Mod+S'},platforms:{}}}});
 await dialog.getByTestId('setup-import-file').setInputFiles({name:'k.somnia-settings.json',mimeType:'application/json',buffer:Buffer.from(file)});
 await expect(dialog.getByTestId('row-shortcut:project.export')).toHaveAttribute('data-status','conflict');
 await expect(dialog.getByTestId('setup-apply')).toBeDisabled();
 await dialog.getByRole('combobox',{name:/already used by project\.save/}).selectOption('replace');
 await expect(dialog.getByTestId('setup-apply')).toBeEnabled();
 await dialog.getByTestId('setup-apply').click();
 await expect(dialog.getByTestId('setup-note')).toContainText('Applied 1 changes');
 // the winning shortcut and the explicit unbind of the other command are both persisted
 const overrides=await page.evaluate(()=>JSON.parse(localStorage.getItem('somnia.shortcuts.v1')||'{}') as Record<string,string>);
 expect(overrides['project.export']).toBe('Mod+S');
 expect(overrides['project.save']).toBe('');
 await dialog.getByTestId('setup-undo').click();
 await expect(dialog.getByTestId('setup-note')).toContainText('Restored');
 expect(await page.evaluate(()=>localStorage.getItem('somnia.shortcuts.v1')||'{}')).toBe('{}');
});

test('replace mode resets omitted settings only after the reset count is confirmed',async({page})=>{
 test.setTimeout(60_000);
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();await page.keyboard.press('Control+,');
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Code editor',exact:true}).click();
 await dialog.getByRole('checkbox',{name:/Emmet/}).uncheck();
 await dialog.getByRole('button',{name:/^Editing/}).click();
 await dialog.getByLabel('Units and paper').selectOption('imperial');
 await dialog.getByRole('button',{name:/^Modified/}).click();
 const file=JSON.stringify({app:'somnia',kind:'setup',schemaVersion:1,scope:'user',categories:{settings:{mode:'overrides',values:{'workflow.units':'metric'}}}});
 await dialog.getByTestId('setup-import-file').setInputFiles({name:'r.somnia-settings.json',mimeType:'application/json',buffer:Buffer.from(file)});
 await expect(dialog.getByTestId('setup-review')).toBeVisible();
 await expect(dialog.getByTestId('row-setting:workflow.units')).toHaveAttribute('data-status','change');
 await dialog.getByTestId('mode-select').selectOption('replace');
 await dialog.getByTestId('import-cat-editor').check();
 await expect(dialog.getByTestId('row-setting:editor.emmet')).toHaveAttribute('data-status','reset');
 await expect(dialog.getByTestId('setup-ack')).toBeVisible();
 await expect(dialog.getByTestId('setup-apply')).toBeDisabled();
 await dialog.getByTestId('setup-ack').check();
 await expect(dialog.getByTestId('setup-apply')).toBeEnabled();
 await dialog.getByTestId('setup-apply').click();
 await expect(dialog.getByTestId('setup-note')).toContainText('Applied 2 changes');
 await expect(dialog.getByTestId('modified-workflow.units')).toContainText('metric');
 await expect(dialog.getByTestId('modified-editor.emmet')).toHaveCount(0);
});
