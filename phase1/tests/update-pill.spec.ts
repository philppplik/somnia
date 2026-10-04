import {test,expect} from '@playwright/test';
test('status bar shows a green pill when a newer release exists',async({page})=>{
 await page.route('https://api.github.com/repos/philppplik/somnia/releases*',r=>r.fulfill({json:[{tag_name:'v99.0.0',html_url:'https://github.com/philppplik/somnia/releases/tag/v99.0.0',prerelease:false,assets:[]}]}));
 await page.goto('/');const pill=page.getByTestId('update-pill');await expect(pill).toBeVisible();await expect(pill).toHaveText('New version 99.0.0 - Update now');await expect(pill).toHaveAttribute('href',/releases\/tag\/v99/);});
test('no pill when up to date or check is off',async({page})=>{
 await page.route('https://api.github.com/repos/philppplik/somnia/releases*',r=>r.fulfill({json:[]}));
 await page.goto('/');await page.waitForTimeout(800);await expect(page.getByTestId('update-pill')).toHaveCount(0);});
