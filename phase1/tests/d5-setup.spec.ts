import {test,expect} from '@playwright/test';
for (const theme of ['light','dark']) test(`setup wizard ${theme}`,async({page})=>{
 await page.goto('/d5-preview.html');
 await page.addStyleTag({content:`:root{--surface:${theme==='light'?'#F8F9FB':'#25262C'};--bg:${theme==='light'?'#EFF0F4':'#1B1C21'};--text:${theme==='light'?'#262732':'#EDEEF3'};--text-muted:${theme==='light'?'#686A78':'#A4A6B4'};--border:${theme==='light'?'#D8DAE3':'#42444E'};--accent:#8659e5}body{margin:0;background:var(--bg);font-family:Arial}button,input{font:inherit;color:inherit;border:1px solid var(--border);border-radius:8px;background:var(--surface);padding:8px;cursor:pointer}input{box-sizing:border-box;width:100%}button:disabled{opacity:.5}h2{font-size:20px}`});
 await expect(page.getByTestId('deploy-setup')).toHaveAttribute('data-step','prepare');
 await expect(page.getByLabel('Full bootstrap script')).toContainText('set -eu');
 await page.screenshot({path:`/downloads/d5-${theme}-setup.png`,fullPage:true});
 await page.getByRole('button',{name:'I ran the script / server already prepared'}).click();
 await expect(page.getByTestId('deploy-dns-status')).toHaveAttribute('data-ready','false');
 await expect(page.getByText('example.com does not point at your server yet.')).toBeVisible();
 await page.screenshot({path:`/downloads/d5-${theme}-dns.png`,fullPage:true});
});
