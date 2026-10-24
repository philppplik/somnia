import {mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test,expect} from './fixtures';

// Tree dropdowns: Project > Publish > Plan by mouse and by keyboard, light and dark screenshots.
// Screenshots go to $MENU_SUBMENU_SHOTS (default: a temp dir). Never /downloads.
const out=process.env.MENU_SUBMENU_SHOTS||join(tmpdir(),'somnia-menu-submenus');mkdirSync(out,{recursive:true});

/** The deploy commands only register inside Tauri. Register them with an empty backend (menu structure only, nothing is run) and force a menu re-render by switching studio and back. */
async function ready(page:import('@playwright/test').Page){
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Project',exact:true})).toBeVisible();
 await page.evaluate(async()=>{
  const m=await import(/* @vite-ignore */ '/src/lib/deploy/register.ts');
  m.registerDeployCommands({} as never);
 });
 await page.getByRole('radio',{name:'Somnia Documents'}).click();
 await page.getByRole('radio',{name:'Somnia Code'}).click();
 await expect(page.getByRole('button',{name:'Project',exact:true})).toBeVisible();
}

test('Project menu shows submenu triggers; Publish > Plan opens by mouse',async({page})=>{
 await ready(page);
 await page.getByRole('button',{name:'Project',exact:true}).click();
 const publish=page.getByRole('menuitem',{name:'Publish',exact:true});
 await expect(publish).toBeVisible();
 await publish.hover();
 const plan=page.getByRole('menuitem',{name:'Plan publish'});
 await expect(plan).toBeVisible();
 await page.screenshot({path:join(out,'project-publish-light.png')});
 // Moving the pointer onto the item highlights it (the submenu stays open while the pointer travels).
 await plan.hover();
 await expect(plan).toHaveAttribute('data-highlighted','');
});

test('keyboard: Arrow Right opens a submenu, Arrow Left closes it, Escape closes the menu',async({page})=>{
 await ready(page);
 await page.getByRole('button',{name:'Project',exact:true}).focus();
 await page.keyboard.press('Enter');
 const publish=page.getByRole('menuitem',{name:'Publish',exact:true});
 await expect(publish).toBeVisible();
 // Walk down until the Publish trigger is highlighted.
 for(let i=0;i<40;i++){
  if(await publish.evaluate(el=>el.hasAttribute('data-highlighted')))break;
  await page.keyboard.press('ArrowDown');
 }
 await expect(publish).toHaveAttribute('data-highlighted','');
 await page.keyboard.press('ArrowRight');
 const plan=page.getByRole('menuitem',{name:'Plan publish'});
 await expect(plan).toBeVisible();
 await page.keyboard.press('ArrowLeft');
 await expect(plan).toHaveCount(0);
 await expect(publish).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(publish).toHaveCount(0);
});

test('typeahead jumps to a submenu trigger',async({page})=>{
 await ready(page);
 await page.getByRole('button',{name:'Project',exact:true}).focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('menuitem',{name:'Publish',exact:true})).toBeVisible();
 await page.keyboard.type('Pub');
 await expect(page.getByRole('menuitem',{name:'Publish',exact:true})).toHaveAttribute('data-highlighted','');
});

test('every top-level menu opens, and Help stays flat',async({page})=>{
 await ready(page);
 for(const name of ['Project','Edit','View','Insert','Tools','Help']){
  const trigger=page.getByRole('button',{name,exact:true});
  await trigger.click();
  await expect(page.locator('.menu-popup').first()).toBeVisible();
  await page.keyboard.press('Escape');
 }
 await page.getByRole('button',{name:'Help',exact:true}).click();
 await expect(page.locator('[data-menu-submenu]')).toHaveCount(0);
});

test('dark theme screenshot of the open submenu',async({page})=>{
 await ready(page);
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
 await page.getByRole('button',{name:'Project',exact:true}).click();
 await page.getByRole('menuitem',{name:'Publish',exact:true}).hover();
 await expect(page.getByRole('menuitem',{name:'Plan publish'})).toBeVisible();
 await page.screenshot({path:join(out,'project-publish-dark.png')});
});
