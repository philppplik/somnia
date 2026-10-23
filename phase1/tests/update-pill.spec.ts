import {readFileSync} from 'node:fs';
import {test,expect} from './fixtures';
test('status bar shows a green pill when a newer release exists',async({page})=>{
 await page.route('https://api.github.com/repos/philppplik/somnia/releases*',r=>r.fulfill({json:[{tag_name:'v99.0.0',html_url:'https://github.com/philppplik/somnia/releases/tag/v99.0.0',prerelease:false,assets:[]}]}));
 await page.goto('/');const pill=page.getByTestId('update-pill');await expect(pill).toBeVisible();await expect(pill).toHaveText('New version 99.0.0 - Update now');await expect(pill).toHaveAttribute('href',/releases\/tag\/v99/);});
test('no pill when up to date or check is off',async({page})=>{
 await page.route('https://api.github.com/repos/philppplik/somnia/releases*',r=>r.fulfill({json:[]}));
 await page.goto('/');await page.waitForTimeout(800);await expect(page.getByTestId('update-pill')).toHaveCount(0);});
test('same-core beta update remains visible after switching update channels',async({page})=>{
 // Derive the remote from the current somniaRelease: a pinned literal breaks on every release bump.
 const release=JSON.parse(readFileSync('./package.json','utf8')).somniaRelease as string;
 const next=release.replace(/beta\.(\d+)$/,(_m,n)=>'beta.'+(Number(n)+1));
 if(next===release)throw new Error('update-pill spec expects a beta somniaRelease, got '+release);
 await page.addInitScript(()=>localStorage.setItem('somnia.updatePrefs.v1',JSON.stringify({channel:'beta',intervalMinutes:1440})));
 await page.route('https://api.github.com/repos/philppplik/somnia/releases*',r=>r.fulfill({json:[{tag_name:'v'+next,prerelease:true,html_url:'https://github.com/philppplik/somnia/releases/tag/v'+next,assets:[]}]}));
 await page.goto('/');const pill=page.getByTestId('update-pill');await expect(pill).toBeVisible();await expect(pill).toContainText(next);
 await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Updates',exact:true}).click();
 await page.getByRole('combobox',{name:'Update channel'}).selectOption('stable');await expect(pill).toHaveCount(0);
 await page.getByRole('combobox',{name:'Update channel'}).selectOption('alpha');await expect(pill).toBeVisible();
 const auto=page.getByRole('checkbox',{name:'Check for updates on start'});await auto.uncheck();await expect(pill).toHaveCount(0);await auto.check();await expect(pill).toBeVisible();
});
