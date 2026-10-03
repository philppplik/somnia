import {test,expect} from '@playwright/test';
test('install extension',async({page})=>{await page.goto('/');await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Extensions'}).click();
await page.getByLabel('Extension manifest JSON').fill('{"id":"acme.hello","name":"Hello","version":"0.1.0","apiVersion":1,"permissions":["network"]}');await page.getByRole('button',{name:'Install'}).click();await expect(page.getByRole('alert')).toContainText('Unknown permission');
await page.getByLabel('Extension manifest JSON').fill('{"id":"acme.hello","name":"Hello","version":"0.1.0","apiVersion":1,"permissions":[]}');await page.getByRole('button',{name:'Install'}).click();await expect(page.getByLabel('Installed extensions')).toContainText('Hello');});
