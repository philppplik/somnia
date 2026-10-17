import {test,expect} from './fixtures';
test.use({sample:true});
test('advanced export center: grouped commands, dark theme, round trip through project export',async({page})=>{
 await page.addInitScript(()=>{try{localStorage.setItem('somnia.theme','dark');}catch{/* storage unavailable */}});
 await page.goto('/');
 await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();
 // register a second studio's export commands so the dialog shows more than one group
 await page.getByRole('radio',{name:/^(Somnia )?Design$/}).click();
 await expect(page.getByRole('radio',{name:/^(Somnia )?Design$/})).toHaveAttribute('aria-checked','true');
 await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');await m.executeCommand('project.export.advanced');});
 const dialog=page.getByRole('dialog');
 await expect(page.getByTestId('export-center')).toBeVisible();
 await expect(page.getByTestId('export-center-group-project')).toBeVisible();
 await expect(page.getByTestId('export-center-group-design')).toBeVisible();
 await page.waitForTimeout(300);
 await dialog.screenshot({path:'test-results/export-center-dark.png'});
 // vector studio adds its format presets (rows may stay disabled without a document); reopen to pick up newly registered commands
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('export-center')).toHaveCount(0);
 await page.getByRole('radio',{name:'Somnia Vector'}).click();
 await expect(page.getByRole('radio',{name:'Somnia Vector'})).toHaveAttribute('aria-checked','true');
 await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');await m.executeCommand('project.export.advanced');});
 await page.getByTestId('export-center-presets-vector').waitFor({state:'visible'});
 await expect(page.getByTestId('export-center-preset-png2x')).toBeVisible();
 await dialog.screenshot({path:'test-results/export-center-presets-dark.png'});
 // filter narrows the list; arrow keys walk input -> rows; Enter runs the focused row
 await page.getByTestId('export-center-search').fill('Export project');
 await expect(page.getByTestId('export-center-cmd-project.export')).toBeVisible();
 await expect(page.getByTestId('export-center-cmd-project.export.advanced')).toHaveCount(0);
 await expect(page.getByTestId('export-center-group-vector')).toHaveCount(0);
 await page.getByTestId('export-center-search').press('ArrowDown');
 await expect(page.getByTestId('export-center-cmd-project.export')).toBeFocused();
 // a row runs its command: the project export dialog opens
 await page.getByTestId('export-center-search').fill('');
 await page.getByTestId('export-center-cmd-project.export').press('Enter');
 await expect(page.getByTestId('export-center')).toHaveCount(0);
 await expect(page.getByRole('dialog',{name:'Advanced Export'})).toBeVisible();
 // ...and its advanced link returns to the center
 await page.getByTestId('export-advanced-open').click();
 await expect(page.getByTestId('export-center')).toBeVisible();
 // the run export now leads the recent group
 await expect(page.getByTestId('export-center-group-recent')).toBeVisible();
 await expect(page.getByTestId('export-center-group-recent').getByTestId('export-center-cmd-project.export')).toBeVisible();
});
test('export center in light theme: focused row shows the global focus ring',async({page})=>{
 await page.addInitScript(()=>{try{localStorage.setItem('somnia.theme','light');}catch{/* storage unavailable */}});
 await page.goto('/');
 await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();
 await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');await m.executeCommand('project.export.advanced');});
 await expect(page.getByTestId('export-center')).toBeVisible();
 await page.getByTestId('export-center-search').press('ArrowDown');
 const row=page.getByTestId('export-center-cmd-project.export');
 await expect(row).toBeFocused();
 const outline=await row.evaluate(el=>getComputedStyle(el).outlineStyle);
 expect(outline).toBe('solid');
 await page.getByRole('dialog').screenshot({path:'test-results/export-center-light-focus.png'});
});
