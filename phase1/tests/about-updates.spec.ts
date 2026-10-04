import {test,expect} from '@playwright/test';
test('About shows version, MIT licence and third-party list',async({page})=>{await page.goto('/');await page.keyboard.press('Control+,');await page.getByRole('button',{name:'About',exact:true}).click();
 await expect(page.getByText(/Licensed under the MIT License/)).toBeVisible();await page.getByText(/Third-party software \(\d+ packages\)/).click();await expect(page.getByLabel('Third-party software')).toContainText('react');});
test('Updates finds a newer GitHub release and links the installer',async({page})=>{
 await page.route('https://api.github.com/repos/philppplik/somnia/releases*',r=>r.fulfill({json:[{tag_name:'v9.5',name:'Somnia v9.5',prerelease:true,draft:false,html_url:'https://github.com/philppplik/somnia/releases/tag/v9.5',assets:[{name:'Somnia-v9.5-x64-setup.exe',browser_download_url:'https://github.com/x/Somnia-v9.5-x64-setup.exe'}]}]}));
 await page.goto('/');await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Updates',exact:true}).click();await page.getByRole('button',{name:'Check for updates'}).click();
 await expect(page.getByRole('status').filter({hasText:'Somnia v9.5 is available'})).toBeVisible();await expect(page.getByRole('link',{name:/Download Somnia-v9.5-x64-setup.exe/})).toBeVisible();});
test('Updates says up to date when nothing newer exists',async({page})=>{
 await page.route('https://api.github.com/repos/philppplik/somnia/releases*',r=>r.fulfill({json:[{tag_name:'v8.5-alpha',html_url:'x',prerelease:true}]}));
 await page.goto('/');await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Updates',exact:true}).click();await page.getByRole('button',{name:'Check for updates'}).click();
 await expect(page.getByText('You are up to date.')).toBeVisible();});
