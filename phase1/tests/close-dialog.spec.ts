import {test,expect} from '@playwright/test';
import {showCode} from './helpers';
test('close prompt offers keep draft, discard and cancel',async({page})=>{await page.goto('/');await showCode(page);
 await page.getByLabel('Source code').click();await page.keyboard.type('x');
 await page.evaluate(()=>(window as any).__somnia.requestClose('memory'));
 const d=page.getByRole('dialog');await expect(d).toContainText('You have unsaved changes');
 await expect(d.getByRole('button',{name:'Keep draft and close'})).toBeVisible();await expect(d.getByRole('button',{name:'Discard draft and close'})).toBeVisible();
 await d.getByRole('button',{name:'Cancel'}).click();await expect(d).toBeHidden();});
