import {test,expect} from './fixtures';
import {openAddExtension,enableExtension} from './extension-popup-helpers';
const manifest={id:'acme.accents',name:'Accent Pack',version:'1.0.0',apiVersion:1,permissions:[],
 contributes:{accentPalettes:[
  {id:'ocean-blue',label:'Ocean Blue',light:'#075d96',dark:'#80d4ff'},
  {id:'sakura-pink',label:'Sakura Pink',light:'#a33165',dark:'#f0a6ca'},
 ]}};
const install=async(page:import('@playwright/test').Page)=>{
 await openAddExtension(page);
 await page.getByLabel('somnia-extension.toml',{exact:true}).fill(JSON.stringify(manifest));
 await page.getByRole('button',{name:'Inspect manifest',exact:true}).click();
 await page.getByRole('checkbox',{name:'I reviewed these permissions',exact:true}).check();
 await page.getByRole('button',{name:'Install',exact:true}).click();
 await page.locator('.ext-consent').getByRole('button',{name:'Install and enable',exact:true}).click();
 await enableExtension(page,'Accent Pack');
 await page.keyboard.press('Escape');
};
const accent=(page:import('@playwright/test').Page)=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());

test('extension accent palettes apply the light and dark variants in Settings',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('somnia.extensions.security.v2',JSON.stringify({version:2,acknowledged:true,restricted:false,developerMode:false,extensions:{}})));
 await install(page);
 await page.keyboard.press('Control+,');
 await page.getByLabel('App theme').selectOption('light');
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByRole('button',{name:'Ocean Blue (Accent Pack) accent',exact:true}).click();
 expect(await accent(page)).toBe('#075d96');
 await page.getByLabel('App theme').selectOption('dark');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByRole('button',{name:'Sakura Pink (Accent Pack) accent',exact:true}).click();
 expect(await accent(page)).toBe('#f0a6ca');
 await page.reload();
 expect(await accent(page)).toBe('#f0a6ca');
});

test('malformed accent palettes are rejected at install',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('somnia.extensions.security.v2',JSON.stringify({version:2,acknowledged:true,restricted:false,developerMode:false,extensions:{}})));
 await openAddExtension(page);
 await page.getByLabel('somnia-extension.toml',{exact:true}).fill(JSON.stringify({...manifest,contributes:{accentPalettes:[{id:'bad',label:'Bad',light:'red',dark:'#80d4ff'}]}}));
 await page.getByRole('button',{name:'Inspect manifest',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('#rrggbb');
});
