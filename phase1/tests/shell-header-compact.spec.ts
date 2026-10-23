import {test,expect} from './fixtures';
import {mkdirSync} from 'node:fs';

// Narrow header (app minimum 960px): the six top-level menus collapse into one compact menu
// that keeps every group reachable as a submenu; the account greeting hides, the avatar stays.
test.beforeEach(()=>mkdirSync('test-results/shell',{recursive:true}));

test('960px: compact menu keeps all groups reachable and commands execute',async({page})=>{
 await page.setViewportSize({width:960,height:900});
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 // no header overflow at the declared app minimum
 await expect.poll(()=>page.evaluate(()=>{const h=document.querySelector('header')!;return h.scrollWidth-h.clientWidth;})).toBe(0);
 // full triggers hidden, compact trigger visible
 await expect(page.getByRole('button',{name:'Project',exact:true})).toBeHidden();
 const compact=page.getByRole('button',{name:'Menu'});
 await expect(compact).toBeVisible();
 // account stays accessible (avatar button with aria-label), greeting hidden
 await expect(page.getByRole('button',{name:'Open account'})).toBeVisible();
 await expect(page.locator('.account-greeting')).toBeHidden();
 // every top-level group is a submenu of the compact menu
 await compact.click();
 for(const name of ['Project','Edit','View','Insert','Tools','Help'])
  await expect(page.getByRole('menuitem',{name:new RegExp('^'+name)})).toBeVisible();
 await page.screenshot({path:'test-results/shell/header-960-compact-open.png'});
 // a command through the compact path executes: Project > New project creates a buffer
 await page.getByRole('menuitem',{name:/^Project/}).hover();
 await page.getByRole('menuitem',{name:'New project'}).click();
 await expect(page.getByRole('dialog',{name:'New project'})).toBeVisible();
 await page.keyboard.press('Escape');
});

test('boundary: compact below 1080, full bar from 1080 up, no overflow anywhere',async({page})=>{
 // Tailwind v4 max-* is exclusive: at exactly 1080 the full bar shows (and fits: overflow 0).
 for(const w of [960,1000,1080,1120,1200]){
  await page.setViewportSize({width:w,height:900});
  await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>{const h=document.querySelector('header')!;return h.scrollWidth-h.clientWidth;})).toBe(0);
  await expect(page.getByRole('button',{name:'Menu'})).toBeVisible({visible:w<1080});
  await expect(page.getByRole('button',{name:'Project',exact:true})).toBeVisible({visible:w>=1080});
 }
});

test('960px with Sound studio active: header stays clean, compact menu present',async({page})=>{
 await page.setViewportSize({width:960,height:900});
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 // the left rail hides studio radios below 1340px; switch via the store like the app itself would
 await page.evaluate(async()=>{const s:any=await import('/src/store/appStore.ts');s.requestStudio('sound','automatic');});
 await expect(page.locator('[data-testid=sound-start],[data-testid=sound-workspace]').first()).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>{const h=document.querySelector('header')!;return h.scrollWidth-h.clientWidth;})).toBe(0);
 await expect(page.getByRole('button',{name:'Menu'})).toBeVisible();
 await page.screenshot({path:'test-results/shell/header-960-sound.png',clip:{x:0,y:0,width:960,height:120}});
});
