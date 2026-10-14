import {test,expect} from './fixtures';
// CI-only app E2E. Real app prerequisites/engine builds are not bypassed.
test('Appearance theme import persists, switches schemes, honors custom accent/high contrast and supports undo/reset',async({page})=>{
 await page.goto('/');await page.keyboard.press('Control+,');const panel=page.getByTestId('theme-import-panel');
 await page.getByLabel('App theme',{exact:true}).selectOption('light');
 await panel.getByLabel('Theme data').fill(JSON.stringify({name:'CI theme',cssVars:{light:{background:'#eeeeee',foreground:'#101014',primary:'#123456','primary-foreground':'#ffffff'},dark:{background:'#08080d',foreground:'#ffffff',primary:'#abcdef','primary-foreground':'#101014'}}}));
 await panel.getByRole('button',{name:'Apply theme',exact:true}).click();await expect(panel.getByRole('status')).toContainText('CI theme');
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim())).toBe('#eeeeee');
 await page.getByLabel('Accent colour',{exact:true}).fill('#ffff00');expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#ffff00');
 await page.getByLabel('Contrast',{exact:true}).selectOption('high');expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent-fill').trim())).toBe('#3c2caf');
 await page.getByLabel('Contrast',{exact:true}).selectOption('standard');await page.getByLabel('App theme',{exact:true}).selectOption('dark');await page.reload();await page.keyboard.press('Control+,');await expect(panel.getByRole('status')).toContainText('CI theme');
 await panel.getByRole('button',{name:'Reset imported theme',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Default');await panel.getByRole('button',{name:'Undo theme',exact:true}).click();await expect(panel.getByRole('status')).toContainText('CI theme');
});
