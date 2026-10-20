import {test,expect} from './fixtures';
test('status bar shows a green pill when a newer release exists',async({page})=>{
 await page.route('https://api.github.com/repos/philppplik/somnia/releases*',r=>r.fulfill({json:[{tag_name:'v99.0.0',html_url:'https://github.com/philppplik/somnia/releases/tag/v99.0.0',prerelease:false,assets:[]}]}));
 await page.goto('/');const pill=page.getByTestId('update-pill');await expect(pill).toBeVisible();await expect(pill).toHaveText('New version 99.0.0 - Update now');await expect(pill).toHaveAttribute('href',/releases\/tag\/v99/);});
test('no pill when up to date or check is off',async({page})=>{
 await page.route('https://api.github.com/repos/philppplik/somnia/releases*',r=>r.fulfill({json:[]}));
 await page.goto('/');await page.waitForTimeout(800);await expect(page.getByTestId('update-pill')).toHaveCount(0);});
test('same-core beta update remains visible after switching update channels',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('somnia.updatePrefs.v1',JSON.stringify({channel:'beta',intervalMinutes:1440})));
 await page.route('https://api.github.com/repos/philppplik/somnia/releases*',r=>r.fulfill({json:[{tag_name:'v12.3.0-beta.1',prerelease:true,html_url:'https://github.com/philppplik/somnia/releases/tag/v12.2.0-beta.11',assets:[]}]}));
 await page.goto('/');const pill=page.getByTestId('update-pill');await expect(pill).toBeVisible();await expect(pill).toContainText('12.3.0-beta.1');
 await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Updates',exact:true}).click();
 await page.getByRole('combobox',{name:'Update channel'}).selectOption('stable');await expect(pill).toHaveCount(0);
 await page.getByRole('combobox',{name:'Update channel'}).selectOption('alpha');await expect(pill).toBeVisible();
 const auto=page.getByRole('checkbox',{name:'Check for updates on start'});await auto.uncheck();await expect(pill).toHaveCount(0);await auto.check();await expect(pill).toBeVisible();
});
